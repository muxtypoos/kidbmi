/*
 * Engine tests: worked examples with answers that can be checked by hand, run directly against
 * src/engine.js with no browser. Run: node tests/engine.js
 */
"use strict";
const E = require("../src/engine.js");
const CEN = require("../src/data/rcpch-bmi-centiles.json");
let pass = 0, fail = 0;
const eq = (name, got, want, tol = 0) => {
  const good = typeof want === "number" ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (good) pass++; else { fail++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
};

/* rounding */
eq("fl rounds down", E.fl(0.29, 1), 0.2);
eq("fl epsilon (0.3 stays 0.3)", E.fl(0.1 + 0.2, 1), 0.3);

/* BMI: 70 kg, 175 cm = 22.857 */
eq("BMI", E.bmi(70, 175), 22.857142857, 1e-8);
eq("BMI missing height", E.bmi(70, 0), 0);
eq("BMI missing weight", E.bmi(0, 175), 0);

/* age */
eq("6 months", E.ageYears(6, "m"), 0.5, 1e-12);
eq("30 days", E.ageYears(30, "d"), 30 / 365.25, 1e-12);
eq("2 weeks", E.ageYears(2, "w"), 14 / 365.25, 1e-12);
eq("8 years", E.ageYears(8, "y"), 8);
eq("no age", E.ageYears("", "y"), 0);
eq("negative age", E.ageYears(-3, "y"), 0);

/* the five formulas, 70 kg, 175 cm (values computed independently) */
const b70 = E.bmi(70, 175);
eq("Janmahasatian male", E.lbwRaw("jan", 70, 175, true, b70), 55.857107722577474, 1e-9);
eq("Janmahasatian female", E.lbwRaw("jan", 70, 175, false, b70), 45.19701492537313, 1e-9);
eq("Boer male", E.lbwRaw("boer", 70, 175, true, b70), 56.015, 1e-9);
eq("Boer female", E.lbwRaw("boer", 70, 175, false, b70), 52.115, 1e-9);
eq("James male", E.lbwRaw("james", 70, 175, true, b70), 56.52, 1e-9);
eq("James female", E.lbwRaw("james", 70, 175, false, b70), 51.22, 1e-9);
eq("Hume male", E.lbwRaw("hume", 70, 175, true, b70), 52.80915, 1e-9);
eq("Hume female", E.lbwRaw("hume", 70, 175, false, b70), 50.57775, 1e-9);

/* Peters: adult and child; same for both sexes */
eq("Peters ECV adult", E.petersECV(70, 175), 14.095961796655915, 1e-9);
eq("Peters LBW adult", E.lbwRaw("peters", 70, 175, true, b70), 53.56465482729248, 1e-9);
eq("Peters LBW male = female", E.lbwRaw("peters", 70, 175, false, b70), E.lbwRaw("peters", 70, 175, true, b70));
eq("Peters ECV child 30 kg 130 cm", E.petersECV(30, 130), 6.571092932882003, 1e-9);
eq("Peters LBW child 30 kg 130 cm", E.lbw("peters", 30, 130, true).value, 24.97015314495161, 1e-9);
eq("Peters LBW = 3.8 x ECV", E.lbw("peters", 30, 130, false).value, 3.8 * E.petersECV(30, 130), 1e-12);

/* safeguards */
const t = E.lbw("jan", 70, 175, true);
eq("lbw() result", t.value, 55.857107722577474, 1e-9);
eq("lbw() plausible", t.implausible, false);
eq("lbw() reports formula", t.formula, "jan");
/* James collapses in extreme obesity: 200 kg, 170 cm male gives 42.8 kg, under 25% of 200 kg */
const ob = E.lbw("james", 200, 170, true);
eq("James raw value", ob.raw, 1.1 * 200 - 128 * Math.pow(200 / 170, 2), 1e-9);
eq("implausible flagged", ob.implausible, true);
eq("implausible still gives the number", ob.value, ob.raw, 1e-9);
eq("Janmahasatian still fine for the same patient", E.lbw("jan", 200, 170, true).implausible, false);
eq("lbwAll marks implausible", E.lbwAll(200, 170, true)[2], { id: "james", name: "James", value: 1.1 * 200 - 128 * Math.pow(200 / 170, 2), pct: 100 * (1.1 * 200 - 128 * Math.pow(200 / 170, 2)) / 200, implausible: true, capped: false });
/* never above total weight: very tall, thin 40 kg 190 cm with Boer (47.81) */
const cap = E.lbw("boer", 40, 190, true);
eq("capped at total weight", cap.value, 40);
eq("capped flag", cap.capped, true);
eq("not capped normally", t.capped, false);
eq("extreme: flagged, shown as 0 not negative", [E.lbw("james", 300, 100, true).implausible, E.lbw("james", 300, 100, true).value], [true, 0]);
eq("missing height: not ok", E.lbw("jan", 70, 0, true).ok, false);
eq("missing height: zero", E.lbw("jan", 70, 0, true).value, 0);

/* 3-year-old girl, 20 kg, 100 cm: Boer 4.04 kg and Hume 4.43 kg are flagged; the rest are not */
const g = E.lbwAll(20, 100, false);
eq("girl Boer value", g[1].value, 4.04, 1e-9); eq("girl Boer flagged", g[1].implausible, true);
eq("girl Hume value", g[3].value, 0.29569 * 20 + 0.41813 * 100 - 43.2933, 1e-9); eq("girl Hume flagged", g[3].implausible, true);
eq("girl others not flagged", [g[0], g[2], g[4]].map((r) => r.implausible), [false, false, false]);

/* all five at once */
const all = E.lbwAll(70, 175, true);
eq("lbwAll returns five", all.map((r) => r.id), ["jan", "boer", "james", "hume", "peters"]);
eq("lbwAll Hume", all[3].value, 52.80915, 1e-9);
eq("lbwAll percent", all[0].pct, 100 * 55.857107722577474 / 70, 1e-9);

/* Auto formula */
eq("auto: adult", E.suggestFormula(40, 175, 70), "jan");
eq("auto: age 10", E.suggestFormula(10, 140, 35), "peters");
eq("auto: age 16 still child", E.suggestFormula(16, 170, 60), "peters");
eq("auto: age 17 adult", E.suggestFormula(17, 170, 60), "jan");
eq("auto: no age, short", E.suggestFormula(0, 110, 20), "peters");
eq("auto: no age, light adult", E.suggestFormula(0, 165, 28), "peters");
eq("auto: no age, normal", E.suggestFormula(0, 170, 65), "jan");

/* RCPCH centiles. Reference values below are read straight from the RCPCH data file
   (rcpch/digital-growth-charts-server, chart-data/cole-nine-centiles-uk-who-{male,female}-bmi.json): at an exact data age the lookup returns them unchanged. */
const BOY10 = { c04: 13.0196, c2: 13.6783, c9: 14.4421, c25: 15.3419, c50: 16.423, c75: 17.7548, c91: 19.45, c98: 21.7086, c996: 24.9254 };
const GIRL10 = { c04: 12.8164, c2: 13.6106, c9: 14.5304, c25: 15.6099, c50: 16.898, c75: 18.4657, c91: 20.4216, c98: 22.9429, c996: 26.3373 };
for (const k of Object.keys(BOY10)) { eq("boys " + k + " at 10 y", E.cen(CEN, "M", k, 10), BOY10[k], 1e-9); eq("girls " + k + " at 10 y", E.cen(CEN, "F", k, 10), GIRL10[k], 1e-9); }
eq("boys 2nd at 20 y", E.cen(CEN, "M", "c2", 20), 17.9951, 1e-9);
eq("girls 0.4th at 20 y", E.cen(CEN, "F", "c04", 20), 16.3906, 1e-9);
eq("boys 91st at 2 y", E.cen(CEN, "M", "c91", 2), 17.833, 1e-9);
eq("flat below chart start", E.cen(CEN, "M", "c91", 1), 17.833, 1e-9);
eq("flat above chart end", E.cen(CEN, "F", "c996", 25), 33.1879, 1e-9);
eq("UK-WHO line just under 4 y (boys 2nd)", E.cen(CEN, "M", "c2", 4 - 1e-9), 13.0652, 1e-6);
eq("UK90 line from 4 y (boys 2nd)", E.cen(CEN, "M", "c2", 4), 13.6915, 1e-9);
const nxt = CEN.M.c98[1][5], prv = CEN.M.c98[1][4];
eq("linear between points", E.cen(CEN, "M", "c98", (nxt[0] + prv[0]) / 2), (nxt[1] + prv[1]) / 2, 1e-9);
for (const s of ["M", "F"]) {
  let ordered = true; const ks = E.LINES.map((l) => l.k);
  for (let a = 2; a <= 20; a += 0.1) for (let i = 1; i < ks.length; i++) if (!(E.cen(CEN, s, ks[i - 1], a) < E.cen(CEN, s, ks[i], a))) ordered = false;
  eq("the nine lines are in order at every age (" + s + ")", ordered, true);
}
eq("nine lines", E.LINES.map((l) => l.name), ["0.4th", "2nd", "9th", "25th", "50th", "75th", "91st", "98th", "99.6th"]);

/* banding: boy aged 10.0 y, height 140 cm; lines 13.02 / 13.68 / ... / 19.45 / 21.71 / 24.93 */
const kid = (bmi) => E.paediatric(CEN, { w: bmi * 1.4 * 1.4, hcm: 140, age: 10, male: true });
eq("band very underweight", kid(12).band, "very underweight (below the 0.4th centile)");
eq("band underweight", kid(13.3).band, "underweight (below the 2nd centile)");
eq("band usual range", kid(16).band, "within the usual range (2nd to 91st centile)");
eq("band overweight", kid(20).band, "overweight (\u226591st centile)");
eq("band obese", kid(22).band, "obese (\u226598th centile)");
eq("band severely obese", kid(26).band, "severely obese (\u226599.6th centile)");
eq("levels -2 to 3", [kid(12).level, kid(13.3).level, kid(16).level, kid(20).level, kid(22).level, kid(26).level], [-2, -1, 0, 1, 2, 3]);
eq("exactly on the 98th counts as obese", E.paediatric(CEN, { w: 21.7086 * 1.96, hcm: 140, age: 10, male: true }).level, 2);
eq("exactly on the 2nd is not underweight", E.paediatric(CEN, { w: 13.6783 * 1.96, hcm: 140, age: 10, male: true }).level, 0);
eq("just under the 2nd is underweight", E.paediatric(CEN, { w: 13.67 * 1.96, hcm: 140, age: 10, male: true }).level, -1);
eq("exactly on the 0.4th is not very underweight", E.paediatric(CEN, { w: 13.0196 * 1.96, hcm: 140, age: 10, male: true }).level, -1);
eq("just under the 0.4th is very underweight", E.paediatric(CEN, { w: 13.01 * 1.96, hcm: 140, age: 10, male: true }).level, -2);
eq("all nine centile values returned", Object.keys(kid(16).cc), ["c04", "c2", "c9", "c25", "c50", "c75", "c91", "c98", "c996"]);
eq("centile value returned", kid(16).cc.c98, 21.7086, 1e-9);

/* nearest of the nine lines, boy 10 y */
const nr = (b) => kid(b).nearest;
eq("nearest: BMI 12 is the 0.4th, below", [nr(12).name, nr(12).diff < 0], ["0.4th", true]);
eq("nearest: BMI 13.5 is the 2nd, below", [nr(13.5).name, nr(13.5).diff < 0], ["2nd", true]);
eq("nearest: BMI 16.5 is the 50th, above", [nr(16.5).name, nr(16.5).diff > 0], ["50th", true]);
eq("nearest: BMI 18.5 is the 75th (above) or 91st", nr(18.7).name, "91st");
eq("nearest: BMI 23 is the 98th, above", [nr(23).name, nr(23).diff > 0], ["98th", true]);
eq("nearest: BMI 40 is the 99.6th", nr(40).name, "99.6th");
eq("nearest value is that line's BMI", nr(16.5).value, 16.423, 1e-9);
eq("nearest difference is BMI minus line", nr(16.5).diff, 16.5 - 16.423, 1e-6);
eq("under 2 y not placed", E.paediatric(CEN, { w: 10, hcm: 80, age: 1.5, male: true }).ok, false);
eq("over 20 y not placed", E.paediatric(CEN, { w: 70, hcm: 175, age: 25, male: true }).ok, false);
eq("no age not placed", E.paediatric(CEN, { w: 30, hcm: 130, age: 0, male: true }).ok, false);
eq("no height not placed", E.paediatric(CEN, { w: 30, hcm: 0, age: 8, male: true }).ok, false);
eq("exactly 2 y is placed", E.paediatric(CEN, { w: 12, hcm: 87, age: 2, male: false }).ok, true);
eq("exactly 20 y is placed", E.paediatric(CEN, { w: 60, hcm: 165, age: 20, male: false }).ok, true);

/* input checks */
eq("normal input: no messages", E.checks({ w: 70, hcm: 175, age: 40, entered: { w: 1, h: 1, age: 1 } }), { messages: [], blocked: false });
eq("weight over 300 blocks", E.checks({ w: 400, hcm: 175, age: 0, entered: {} }).blocked, true);
eq("height in metres blocks", E.checks({ w: 70, hcm: 1.75, age: 0, entered: {} }).blocked, true);
eq("height over 250 blocks", E.checks({ w: 70, hcm: 300, age: 0, entered: {} }).blocked, true);
eq("unusual BMI warns, does not block", E.checks({ w: 20, hcm: 190, age: 0, entered: {} }).blocked, false);
eq("unusual BMI message", E.checks({ w: 20, hcm: 190, age: 0, entered: {} }).messages.length, 1);
eq("entered but invalid weight", E.checks({ w: 0, hcm: 0, age: 0, entered: { w: 1 } }).messages.length, 1);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

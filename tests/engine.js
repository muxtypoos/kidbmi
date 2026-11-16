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

/* rounding: fl goes down (lean weight, ages), rd to nearest (BMI, centiles) */
eq("rd rounds to nearest", [E.rd(12.899, 1), E.rd(12.84, 1), E.rd(12.85, 1), E.rd(0.04, 1), E.rd(0.05, 1)], [12.9, 12.8, 12.9, 0, 0.1]);
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
eq("years and months", E.ageFromParts("10", "11", ""), 10 + 11 / 12, 1e-12);
eq("years, months and days", E.ageFromParts(2, 3, 10), 2 + 3 / 12 + 10 / 365.25, 1e-12);
eq("days only (newborn)", E.ageFromParts("", "", "5"), 5 / 365.25, 1e-12);
eq("blank or bad age parts", [E.ageFromParts("", "", ""), E.ageFromParts("x", -1, 0)], [0, 0]);
eq("10 y 11 m is a different centile band to 10 y", E.paediatric(CEN, { w: 19.8 * 1.96, hcm: 140, age: E.ageFromParts(10, 11, 0), male: true }).level !== E.paediatric(CEN, { w: 19.8 * 1.96, hcm: 140, age: 10, male: true }).level, true);
eq("negative age", E.ageYears(-3, "y"), 0);

/* Peters ECV and lean body weight (same for both sexes); values computed independently */
const b70 = E.bmi(70, 175);
eq("Peters ECV adult", E.petersECV(70, 175), 14.095961796655915, 1e-9);
eq("Peters LBW adult", E.lbw(70, 175).raw, 53.56465482729248, 1e-9);
eq("Peters ECV child 30 kg 130 cm", E.petersECV(30, 130), 6.571092932882003, 1e-9);
eq("Peters LBW child 30 kg 130 cm", E.lbw(30, 130).value, 24.97015314495161, 1e-9);
eq("Peters LBW = 3.8 x ECV", E.lbw(30, 130).value, 3.8 * E.petersECV(30, 130), 1e-12);
eq("only Peters is offered", E.FORMULAS.map((f) => f.id), ["peters"]);

/* safeguards */
const t = E.lbw(70, 175);
eq("lbw() plausible", t.implausible, false);
eq("lbw() reports the formula", t.formula, "peters");
eq("lbw() not capped normally", t.capped, false);
/* small child: 20 kg, 100 cm gives 15.7 kg (78%), plausible */
eq("child plausible", E.lbw(20, 100).implausible, false);
/* just over 25%: not flagged; just under: flagged (weight 100 kg, height chosen so that Peters is near 25 kg) */
const near = (h) => E.lbw(100, h);
eq("raw below 25% is implausible", [near(40).raw < 25, near(40).implausible], [true, true]);
eq("implausible still gives the number", near(40).value, near(40).raw, 1e-9);
eq("raw above 25% is plausible", [near(100).raw >= 25, near(100).implausible], [true, false]);
/* never above total weight: tall thin 30 kg 170 cm gives 30.3 */
const cap = E.lbw(30, 170);
eq("capped at total weight", cap.value, 30);
eq("capped flag", cap.capped, true);
eq("capped raw is above weight", cap.raw > 30, true);
eq("missing height: not ok", E.lbw(70, 0).ok, false);
eq("missing weight: not ok", E.lbw(0, 150).ok, false);
eq("missing height: no value", E.lbw(70, 0).value, null);

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
eq("near the 4 y switch is flagged", [E.paediatric(CEN, { w: 16, hcm: 102, age: 3.8, male: true }).nearSwitch, E.paediatric(CEN, { w: 16, hcm: 102, age: 8, male: true }).nearSwitch], [true, false]);
eq("exactly 20 y is placed", E.paediatric(CEN, { w: 60, hcm: 165, age: 20, male: false }).ok, true);

/* input checks */
eq("normal input: no messages", E.checks({ w: 45, hcm: 150, age: 12, entered: { w: 1, h: 1, age: 1 } }), { messages: [], blocked: false });
eq("weight over 300 blocks", E.checks({ w: 400, hcm: 175, age: 0, entered: {} }).blocked, true);
eq("height in metres blocks", E.checks({ w: 70, hcm: 1.75, age: 0, entered: {} }).blocked, true);
eq("height over 250 blocks", E.checks({ w: 70, hcm: 300, age: 0, entered: {} }).blocked, true);
eq("unusual BMI warns, does not block", E.checks({ w: 20, hcm: 190, age: 0, entered: {} }).blocked, false);
eq("unusual BMI message", E.checks({ w: 20, hcm: 190, age: 0, entered: {} }).messages.length, 1);
eq("adult age warns, does not block", [E.checks({ w: 70, hcm: 175, age: 40, entered: {} }).messages.length, E.checks({ w: 70, hcm: 175, age: 40, entered: {} }).blocked], [1, false]);
eq("age over 120 gives one message", E.checks({ w: 70, hcm: 175, age: 150, entered: {} }).messages.length, 1);
eq("infant caution", E.checks({ w: 8, hcm: 70, age: 0.5, entered: {} }).messages.length, 1);
eq("age 1 to 20 gives no age message", E.checks({ w: 20, hcm: 115, age: 6, entered: {} }).messages.length, 0);
eq("entered but invalid weight", E.checks({ w: 0, hcm: 0, age: 0, entered: { w: 1 } }).messages.length, 1);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

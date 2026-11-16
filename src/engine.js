/*
 * KidBMI calculation engine.
 *
 * Every equation and rule in the app lives in this file: BMI, the five lean body weight
 * formulas (Janmahasatian, Boer, James, Hume, Peters), the Peters extracellular fluid
 * volume, and the RCPCH paediatric BMI centile lookup. It is plain JavaScript with no
 * screen code and no global state: each function takes its inputs as arguments and
 * returns its results, so it can be read, audited and tested on its own.
 *
 * Units: weight kg, height cm (hm where a function says metres), age years,
 * BMI kg/m2, volumes litres.
 *
 * The formulas, the 25% plausibility check and the centile interpolation are carried
 * over unchanged from the Admix engine (tests/equivalence.js checks they still agree).
 * The build inserts this file into the page unchanged.
 */
var KidBMI = (function () {
  "use strict";

  /* Round DOWN to d decimals (tiny epsilon so 0.3 stays 0.3). Display helper only. */
  function fl(v, d) {
    var m = Math.pow(10, d == null ? 1 : d);
    return Math.floor(v * m + 1e-9) / m;
  }

  /* ---------- 1. Formula catalogue ---------- */
  var FORMULAS = [
    { id: "jan", name: "Janmahasatian", male: "9270 × W ÷ (6680 + 216 × BMI)", female: "9270 × W ÷ (8780 + 244 × BMI)" },
    { id: "boer", name: "Boer", male: "0.407 × W + 0.267 × H − 19.2", female: "0.252 × W + 0.473 × H − 48.3" },
    { id: "james", name: "James", male: "1.1 × W − 128 × (W ÷ H)²", female: "1.07 × W − 148 × (W ÷ H)²" },
    { id: "hume", name: "Hume", male: "0.3281 × W + 0.33929 × H − 29.5336", female: "0.29569 × W + 0.41813 × H − 43.2933" },
    { id: "peters", name: "Peters", male: "3.8 × 0.0215 × W^0.6469 × H^0.7236", female: "3.8 × 0.0215 × W^0.6469 × H^0.7236" }
  ];
  var IDS = FORMULAS.map(function (f) { return f.id; });

  /* ---------- 2. Basic measures ---------- */

  /* BMI from weight (kg) and height (cm). 0 if either is missing. */
  function bmi(w, hcm) {
    return w > 0 && hcm > 0 ? w / Math.pow(hcm / 100, 2) : 0;
  }

  /* Age in years from the entered value and its unit: d, w, m or y. */
  function ageYears(v, unit) {
    v = +v;
    if (!(v > 0)) return 0;
    var f = { d: 1 / 365.25, w: 7 / 365.25, m: 1 / 12, y: 1 }[unit];
    return v * (f == null ? 1 : f);
  }

  /* ---------- 3. Lean body weight ---------- */

  /* Peters extracellular fluid volume, litres (W kg, H cm). */
  function petersECV(w, hcm) {
    return 0.0215 * Math.pow(w, 0.6469) * Math.pow(hcm, 0.7236);
  }

  /* One formula, no safeguards. f = id, w kg, H cm, male boolean, b = BMI. */
  function lbwRaw(f, w, H, male, b) {
    switch (f) {
      case "boer":
        return male ? 0.407 * w + 0.267 * H - 19.2 : 0.252 * w + 0.473 * H - 48.3;
      case "james":
        return male ? 1.1 * w - 128 * Math.pow(w / H, 2) : 1.07 * w - 148 * Math.pow(w / H, 2);
      case "hume":
        return male ? 0.3281 * w + 0.33929 * H - 29.5336 : 0.29569 * w + 0.41813 * H - 43.2933;
      case "peters":
        return 3.8 * petersECV(w, H);
      default: /* "jan" */
        return male ? 9270 * w / (6680 + 216 * b) : 9270 * w / (8780 + 244 * b);
    }
  }

  /* Lean body weight with safeguards: if the chosen formula gives less than 25% of total
     weight (or not a number) the result is flagged "implausible" (implausible is true) but the number is
     still returned so it can be shown, marked. The value is never above total weight and never below 0
     (0 if the formula gave no number). Returns the working as well as the answer.
     f = id, w kg, hcm cm, male boolean. */
  function lbw(f, w, hcm, male) {
    var b = bmi(w, hcm);
    if (!(b > 0)) return { ok: false, formula: f, value: null, raw: 0, implausible: false, capped: false, bmi: 0 };
    var raw = lbwRaw(f, w, hcm, male, b);
    var implausible = !(raw >= 0.25 * w);
    return { ok: true, formula: f, value: isNaN(raw) ? 0 : Math.max(0, Math.min(w, raw)), raw: raw, implausible: implausible, capped: raw > w, bmi: b };
  }

  /* All five formulas side by side for the same patient. */
  function lbwAll(w, hcm, male) {
    return FORMULAS.map(function (fm) {
      var r = lbw(fm.id, w, hcm, male);
      return { id: fm.id, name: fm.name, value: r.value, pct: 100 * r.value / w, implausible: r.implausible, capped: r.capped };
    });
  }

  /* Which formula "Auto" picks: Peters for children (age up to 16 y, or height up to 120 cm,
     or weight under 30 kg: the same triggers Admix uses to offer paediatric mode),
     otherwise Janmahasatian. */
  function suggestFormula(ageY, hcm, w) {
    return (ageY > 0 && ageY <= 16) || (hcm > 0 && hcm <= 120) || (w > 0 && w < 30) ? "peters" : "jan";
  }

  /* ---------- 4. RCPCH paediatric BMI centiles ----------
     CEN = the centile data table: CEN[sex "M"|"F"][line "c91"|"c98"|"c996"] = [segment under 4 y
     (UK-WHO), segment from 4 y (UK90)], each a list of [age y, BMI] points read from the RCPCH charts. */

  /* BMI on centile line k at age a (years), linear between points, flat outside the chart's ends. */
  function cen(CEN, s, k, a) {
    var g = CEN[s][k][a < 4 ? 0 : 1], i;
    if (a <= g[0][0]) return g[0][1];
    if (a >= g[g.length - 1][0]) return g[g.length - 1][1];
    for (i = 1; i < g.length; i++) {
      if (g[i][0] >= a) {
        var p = g[i - 1], q = g[i];
        return p[1] + (q[1] - p[1]) * (a - p[0]) / (q[0] - p[0]);
      }
    }
  }

  var BANDS = [
    { k: "c996", label: "severely obese (≥99.6th centile)" },
    { k: "c98", label: "obese (≥98th centile)" },
    { k: "c91", label: "overweight (≥91st centile)" }
  ];

  /* Place a child on the RCPCH chart. i = {w kg, hcm, age years, male}. The chart covers 2 to 20 years. */
  function paediatric(CEN, i) {
    var b = bmi(i.w, i.hcm), a = i.age, sx = i.male ? "M" : "F";
    if (!(b > 0)) return { ok: false, reason: "Enter weight and height." };
    if (!(a > 0)) return { ok: false, reason: "Enter age to place the child on the RCPCH chart." };
    if (a < 2) return { ok: false, reason: "The RCPCH BMI chart starts at 2 years, so this child cannot be placed on it." };
    if (a > 20) return { ok: false, reason: "The RCPCH BMI chart ends at 20 years." };
    var c = { c91: cen(CEN, sx, "c91", a), c98: cen(CEN, sx, "c98", a), c996: cen(CEN, sx, "c996", a) };
    var band = "below the 91st centile";
    for (var j = 0; j < BANDS.length; j++) if (b >= c[BANDS[j].k]) { band = BANDS[j].label; break; }
    return { ok: true, bmi: b, age: a, sex: sx, cc: c, band: band, above91: b >= c.c91 };
  }

  /* ---------- 5. Input plausibility ---------- */

  /* Messages about odd inputs. Calculations still run unless blocked is true. i = {w, hcm, age, entered:{w,h,age}}. */
  function checks(i) {
    var m = [], blocked = false, e = i.entered || {};
    if (e.w && !(i.w > 0)) m.push("Weight must be a positive number.");
    if (e.h && !(i.hcm > 0)) m.push("Height must be a positive number.");
    if (e.age && !(i.age > 0)) m.push("Age must be a positive number.");
    if (i.w > 300) { m.push("Weight over 300 kg: calculations paused until corrected."); blocked = true; }
    else if (i.w > 0 && i.w < 0.4) m.push("Weight " + fl(i.w, 1) + " kg is outside the usual range.");
    if (i.hcm > 0 && i.hcm < 5) { m.push("Height under 5 cm: did you enter metres? Height is in cm."); blocked = true; }
    else if (i.hcm > 250) { m.push("Height over 250 cm: calculations paused until corrected."); blocked = true; }
    else if (i.hcm > 0 && i.hcm < 30) m.push("Height " + fl(i.hcm, 0) + " cm is outside the usual range.");
    var b = bmi(i.w, i.hcm);
    if (!blocked && b > 0 && (b < 9 || b > 100)) m.push("BMI " + fl(b, 1).toFixed(1) + " is very unusual: check weight and height.");
    if (i.age > 120) { m.push("Age over 120 years: check the age and its unit."); }
    return { messages: m, blocked: blocked };
  }

  return {
    fl: fl, FORMULAS: FORMULAS, IDS: IDS,
    bmi: bmi, ageYears: ageYears,
    petersECV: petersECV, lbwRaw: lbwRaw, lbw: lbw, lbwAll: lbwAll, suggestFormula: suggestFormula,
    cen: cen, paediatric: paediatric, BANDS: BANDS,
    checks: checks
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = KidBMI;

/*
 * KidBMI calculation engine.
 *
 * Every equation and rule in the app lives in this file: BMI, the Peters lean body weight and
 * extracellular fluid volume (the only lean weight formula offered, as the adult formulas are not
 * validated in children), and the RCPCH paediatric BMI centile lookup. It is plain JavaScript with no
 * screen code and no global state: each function takes its inputs as arguments and returns its
 * results, so it can be read, audited and tested on its own.
 *
 * Units: weight kg, height cm, age years, BMI kg/m2, volumes litres.
 *
 * Peters and the centile interpolation were carried over from the Admix engine (tests/equivalence.js
 * checks they still agree). The build inserts this file into the page unchanged.
 */
var KidBMI = (function () {
  "use strict";

  /* Round DOWN to d decimals (tiny epsilon so 0.3 stays 0.3). Display helper only. */
  function fl(v, d) {
    var m = Math.pow(10, d == null ? 1 : d);
    return Math.floor(v * m + 1e-9) / m;
  }

  /* Round to NEAREST d decimals (tiny epsilon so 12.85 shows as 12.9). Used for BMI, centile values and differences. */
  function rd(v, d) {
    var m = Math.pow(10, d == null ? 1 : d);
    return Math.round(v * m + 1e-9) / m;
  }

  /* ---------- 1. Formula catalogue ---------- */
  var FORMULAS = [
    { id: "peters", name: "Peters", male: "3.8 × 0.0215 × W^0.6469 × H^0.7236", female: "3.8 × 0.0215 × W^0.6469 × H^0.7236" }
  ];

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

  /* Age in years from separate years, months and days boxes (blank or invalid counts as 0). */
  function ageFromParts(y, m, d) {
    var p = function (v) { v = parseFloat(v); return v > 0 ? v : 0; };
    return p(y) + p(m) / 12 + p(d) / 365.25;
  }

  /* ---------- 3. Lean body weight ---------- */

  /* Peters extracellular fluid volume, litres (W kg, H cm). */
  function petersECV(w, hcm) {
    return 0.0215 * Math.pow(w, 0.6469) * Math.pow(hcm, 0.7236);
  }

  /* Peters lean body weight with safeguards: if it comes to less than 25% of total weight (or is not a
     number) the result is flagged "implausible" (implausible is true) but the number is still returned so it
     can be shown, marked. The value is never above total weight (capped is true if it had to be cut back) and
     never below 0. Returns the working as well as the answer. w kg, hcm cm. */
  function lbw(w, hcm) {
    var b = bmi(w, hcm);
    if (!(b > 0)) return { ok: false, formula: "peters", value: null, raw: 0, implausible: false, capped: false, bmi: 0 };
    var raw = 3.8 * petersECV(w, hcm);
    return { ok: true, formula: "peters", value: isNaN(raw) ? 0 : Math.max(0, Math.min(w, raw)), raw: raw, implausible: !(raw >= 0.25 * w), capped: raw > w, bmi: b };
  }

  /* ---------- 4. RCPCH paediatric BMI centiles ----------
     CEN = the centile data table: CEN[sex "M"|"F"][line "c04"|"c2"|...|"c996"] = [segment under 4 y
     (UK-WHO), segment from 4 y (UK90)], each a list of [age y, BMI] points from the RCPCH nine-centile reference data. */

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

  /* The nine RCPCH centile lines, lowest first */
  var LINES = [
    { k: "c04", name: "0.4th" }, { k: "c2", name: "2nd" }, { k: "c9", name: "9th" }, { k: "c25", name: "25th" }, { k: "c50", name: "50th" },
    { k: "c75", name: "75th" }, { k: "c91", name: "91st" }, { k: "c98", name: "98th" }, { k: "c996", name: "99.6th" }
  ];

  /* Bands and their level: -2 very underweight, -1 underweight, 0 usual range, 1 overweight, 2 obese, 3 severely obese,
     4 morbidly obese (at or above the chart's +3.33 SD line: the RCPCH chart prints "Morbidly obese" just above that line).
     Cut-offs follow the RCPCH BMI chart notes: above 91st overweight, 98th very overweight (clinically obese),
     99.6th severely obese; below the 2nd centile unusual (may reflect undernutrition or a small build); below the 0.4th
     further assessment advised. */
  var BANDS = [
    { level: 4, label: "morbidly obese (\u2265+3.33 SD)" },
    { level: 3, label: "severely obese (\u226599.6th centile)" },
    { level: 2, label: "obese (\u226598th centile)" },
    { level: 1, label: "overweight (\u226591st centile)" },
    { level: 0, label: "within the usual range (2nd to 91st centile)" },
    { level: -1, label: "underweight (below the 2nd centile)" },
    { level: -2, label: "very underweight (below the 0.4th centile)" }
  ];
  function bandFor(level) { return BANDS.filter(function (b) { return b.level === level; })[0].label; }

  /* Place a child on the RCPCH chart. i = {w kg, hcm, age years, male}. The chart covers 2 to 20 years. */
  function paediatric(CEN, i) {
    var b = bmi(i.w, i.hcm), a = i.age, sx = i.male ? "M" : "F";
    if (!(b > 0)) return { ok: false, reason: "Enter weight and height." };
    if (!(a > 0)) return { ok: false, reason: "Enter age to place the child on the RCPCH chart." };
    if (a < 2) return { ok: false, reason: "The RCPCH BMI chart starts at 2 years, so this child cannot be placed on it." };
    if (a > 20) return { ok: false, reason: "The RCPCH BMI chart ends at 20 years." };
    var c = {}, nearest = null;
    LINES.forEach(function (l) {
      c[l.k] = cen(CEN, sx, l.k, a);
      var d = b - c[l.k];
      /* nearest line by BMI difference; a tie goes to the lower line */
      if (!nearest || Math.abs(d) < Math.abs(nearest.diff) - 1e-12) nearest = { k: l.k, name: l.name, value: c[l.k], diff: d };
    });
    c.c333 = cen(CEN, sx, "c333", a); /* the +3.33 SD line: not one of the nine centiles, so not used for the nearest line */
    var level = b >= c.c333 ? 4 : b >= c.c996 ? 3 : b >= c.c98 ? 2 : b >= c.c91 ? 1 : b < c.c04 ? -2 : b < c.c2 ? -1 : 0;
    return { ok: true, bmi: b, age: a, sex: sx, cc: c, band: bandFor(level), level: level, above91: b >= c.c91, nearest: nearest, nearSwitch: Math.abs(a - 4) < 0.5 };
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
    if (i.age > 120) m.push("Age over 120 years: check the age you entered.");
    else if (i.age > 20) m.push("Age over 20 years: KidBMI is built for children. Peters and the RCPCH chart are paediatric tools, so use an adult method for adults.");
    else if (i.age > 0 && i.age < 1) m.push("Under 1 year: the RCPCH chart cannot be used, and this app has not verified Peters lean body weight in infants. Use it with caution.");
    return { messages: m, blocked: blocked };
  }

  return {
    fl: fl, rd: rd, FORMULAS: FORMULAS,
    bmi: bmi, ageYears: ageYears, ageFromParts: ageFromParts,
    petersECV: petersECV, lbw: lbw,
    cen: cen, paediatric: paediatric, BANDS: BANDS, LINES: LINES,
    checks: checks
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = KidBMI;

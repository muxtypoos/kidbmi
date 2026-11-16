# KidBMI

Standalone calculator for children: BMI, lean body weight and extracellular fluid volume by the Peters formula, and RCPCH paediatric BMI centiles (ages 2 to 20), including underweight.

- `src/engine.js`: all equations and rules. No screen code, no global state; audit and test it on its own.
- `src/template.html`: the UI. It only reads inputs, calls `KidBMI.*` and displays results.
- `src/data/rcpch-bmi-centiles.json`: the nine RCPCH BMI centile lines, 0.4th to 99.6th (source and licence note in `src/data/README.md`).
- `scripts/build.js`: inlines engine and data into one offline file, `dist/index.html` (usable as a Capacitor web dir).
- `tests/engine.js`: hand-checked worked examples. `tests/equivalence.js`: compares against the Admix engine (set `ADMIX_ENGINE=/path/to/admix/src/engine.js`).

`npm test` runs both test files and the build. Decision support only; it does not replace clinical judgement or local policy.

## Run it
Open `index.html`, or run `npm run build` and open `dist/index.html`. No network needed.

Origin: split out of Admix (https://github.com/muxtypoos/admix). Centile data: RCPCH reference data (see `src/data/README.md`). Lean body weight: Peters AM et al., Br J Anaesth 2011;106:719-723.

## Self-test file (`selftest.csv`)
Open `selftest.csv` in any spreadsheet. Every row is one calculation: the inputs, what the app shows, and a second calculation made a different way (logarithms for Peters, separate centile interpolation) in the last columns. `check` says PASS when the two agree.

- **growth path:** age, height and weight rise steadily together from 2 to 20 years, boys and girls.
- **grid:** every combination of steadily rising ages, heights and weights, including impossible ones, to show how they are flagged.
- **extremes:** tiny and huge values, zero, missing, negative, wrong units, and the edges at 2, 4 and 20 years and at the weight/height limits.

Columns ending `_shown_in_app` are exactly what the screen displays (rounded down to 0.1). Regenerate with `npm run selftest`; `npm test` fails if the file is out of date or any row disagrees.

Printing: the Print button calls window.print() in a browser. In the Capacitor Android app it calls the native `PrintPlugin` (the same plugin Admix uses), so that plugin must be in the Android project.

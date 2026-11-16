# KidBMI

Standalone calculator for children: BMI, lean body weight (Janmahasatian, Boer, James, Hume, Peters), Peters extracellular fluid volume, and RCPCH paediatric BMI centiles (ages 2 to 20).

- `src/engine.js`: all equations and rules. No screen code, no global state; audit and test it on its own.
- `src/template.html`: the UI. It only reads inputs, calls `KidBMI.*` and displays results.
- `src/data/rcpch-bmi-centiles.json`: 91st, 98th and 99.6th centile lines digitised from the RCPCH charts (carried over from Admix).
- `scripts/build.js`: inlines engine and data into one offline file, `dist/index.html` (usable as a Capacitor web dir).
- `tests/engine.js`: hand-checked worked examples. `tests/equivalence.js`: compares against the Admix engine (set `ADMIX_ENGINE=/path/to/admix/src/engine.js`).

`npm test` runs both test files and the build. Decision support only; it does not replace clinical judgement or local policy.

## Run it
Open `index.html`, or run `npm run build` and open `dist/index.html`. No network needed.

Source of the formulas and centile data: Admix (https://github.com/muxtypoos/admix). Lean body weight: Peters AM et al., Br J Anaesth 2011;106:719-723.

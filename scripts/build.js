#!/usr/bin/env node
/*
 * KidBMI build: merges src/template.html, src/engine.js and the RCPCH centile data and chart images into ONE
 * self-contained HTML file, dist/index.html (also usable as a Capacitor web dir).
 * Usage: node scripts/build.js        No dependencies: Node 18+ only.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));

const cen = JSON.stringify(JSON.parse(read("src/data/rcpch-bmi-centiles.json")));
const img = (f) => "data:image/jpeg;base64," + fs.readFileSync(path.join(ROOT, "src/assets", f)).toString("base64");
const tokens = { "@@img:girls@@": img("rcpch-bmi-girls.jpg"), "@@img:boys@@": img("rcpch-bmi-boys.jpg"), "@@json:cal@@": JSON.stringify(JSON.parse(read("src/data/rcpch-chart-calibration.json"))), "@@engine@@": read("src/engine.js").trimEnd(), "@@json:cen@@": cen, "@@version@@": pkg.version };

let html = read("src/template.html");
for (const [k, v] of Object.entries(tokens)) html = html.split(k).join(v);
const left = html.match(/@@[^@\s]+@@/g);
if (left) { console.error("Unreplaced tokens:", [...new Set(left)].join(", ")); process.exit(1); }

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist/index.html"), html);
fs.writeFileSync(path.join(ROOT, "index.html"), html); /* copy at the repo root so GitHub Pages can serve it */
console.log("Built dist/index.html + index.html (" + Math.round(html.length / 1024) + " KB) v" + pkg.version);

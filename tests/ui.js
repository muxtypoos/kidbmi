/*
 * Screen tests: open the built page (dist/index.html) in a headless browser, type values in and check what appears.
 * Needs Playwright and Chrome: `npm i -D playwright`, and set CHROME=/path/to/chrome if it is not at /usr/bin/google-chrome.
 * Skipped LOUDLY (not failed) when Playwright is missing; set REQUIRE_UI=1 to make that a failure.
 * Run: node tests/ui.js   (run `npm run build` first)
 */
"use strict";
const fs = require("fs");
const path = require("path");
let pw;
try { pw = require("playwright"); } catch (e) {
  console.log("************************************************************");
  console.log("* Playwright NOT FOUND: the screen tests were SKIPPED.");
  console.log("************************************************************");
  process.exit(process.env.REQUIRE_UI ? 1 : 0);
}
const FILE = "file://" + path.resolve(__dirname, "../dist/index.html");
const exe = process.env.CHROME || (fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); } };

(async () => {
  const browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  const errors = [];
  const open = async (opts) => {
    const pg = await browser.newPage(Object.assign({ viewport: { width: 420, height: 900 } }, opts));
    pg.on("pageerror", (e) => errors.push(String(e)));
    pg.on("dialog", (d) => d.dismiss());
    await pg.goto(FILE);
    return pg;
  };
  const enter = async (pg, w, h, y, m, d, sex) => {
    await pg.fill("#w", String(w)); await pg.fill("#h", String(h));
    await pg.fill("#agey", y == null ? "" : String(y)); await pg.fill("#agem", m == null ? "" : String(m)); await pg.fill("#aged", d == null ? "" : String(d));
    if (sex) await pg.click("label:has(input[value=" + sex + "])");
  };
  const txt = (pg, sel) => pg.innerText(sel);

  /* header is the bright pink gradient in light mode, the dark one in dark mode */
  let pg = await open({ colorScheme: "light" });
  ok("light mode header is bright pink", /214, 51, 108/.test(await pg.evaluate(() => getComputedStyle(document.querySelector("header")).backgroundImage)));
  const dk = await open({ colorScheme: "dark" });
  ok("dark mode header is the dark gradient", /140, 35, 82/.test(await dk.evaluate(() => getComputedStyle(document.querySelector("header")).backgroundImage)));
  await dk.close();

  /* not ready until age is in; years + months work */
  ok("nothing calculated at first", /Enter weight, height and age/.test(await txt(pg, "#resb")));
  await enter(pg, 45, 140, 10, 11, null, "M");
  ok("10 y 11 m is read as 10.9 y", /BMI at 10\.9 years/.test(await txt(pg, ".bmibox")), await txt(pg, ".bmibox"));
  await enter(pg, 45, 140, 10, null, null);
  ok("10 y alone is 10.0 y", /BMI at 10\.0 years/.test(await txt(pg, ".bmibox")));
  await enter(pg, 12, 85, null, null, 5);
  ok("days only is accepted (newborn age)", !/Enter weight, height and age/.test(await txt(pg, "#resb")));

  /* 0.0 above the line is gone */
  await enter(pg, 21.8, 130, 9, null, null, "M");
  const nb = await txt(pg, ".bn");
  ok("no '0.0 above/below'", !/\b0\.0 (above|below)/.test(nb), nb);

  /* working reproduces by hand */
  await enter(pg, 45.25, 140.5, 10, null, null);
  await pg.click("#wk summary");
  ok("working shows unrounded height", /45\.25 ÷ \(1\.405\)² = 22\.92/.test(await txt(pg, "#wkb")), (await txt(pg, "#wkb")).slice(0, 120));
  ok("total weight shown as entered", /45\.25/.test(await txt(pg, "#resb")));
  await enter(pg, 3.45, 50, 0, 3, null);
  ok("3.45 kg is not re-rounded to 3.5", /3\.45/.test(await txt(pg, "#resb")) && !/\b3\.5 kg/.test(await txt(pg, ".hero")));

  /* off chart label and warnings */
  await enter(pg, 80, 100, 5, null, null, "M");
  ok("off-chart BMI is labelled on the chart", /off chart/.test(await pg.evaluate(() => document.querySelector("#bmsv text").textContent)));
  await enter(pg, 80, 180, 45, null, null);
  ok("adult age warns", /Age over 20/.test(await txt(pg, "#msgs")));
  await enter(pg, 8, 70, null, 8, null);
  ok("infant caution", /Under 1 year/.test(await txt(pg, "#msgs")));
  await enter(pg, 16, 102, 3, 10, null, "M");
  ok("note near the age-4 reference change", /changes from UK-WHO to UK90/.test(await txt(pg, ".bmibox")));
  await enter(pg, 30, 170, 15, null, null);
  ok("capped lean weight says so", /capped at total weight/.test(await txt(pg, ".hero")));

  /* chart enlarge */
  await enter(pg, 45, 140, 10, null, null, "M");
  await pg.click("#chartw");
  ok("chart opens enlarged", await pg.evaluate(() => document.getElementById("zoom").classList.contains("on")));
  ok("enlarged chart has no duplicate ids", await pg.evaluate(() => document.querySelectorAll("#bmimg").length === 1));
  await pg.keyboard.press("Escape");
  ok("Escape closes it", await pg.evaluate(() => !document.getElementById("zoom").classList.contains("on")));

  /* one A4 page when printed, panels closed again afterwards */
  await pg.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await pg.emulateMedia({ media: "print" });
  const pdf = await pg.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok("prints on one A4 page", pages === 1, pages);
  await pg.emulateMedia({ media: "screen" });
  await pg.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  ok("panels opened for printing are closed again (only the one opened by hand stays open)", await pg.evaluate(() => document.querySelectorAll("#wkc details[open]").length) === 1);

  /* narrow screen: nothing sticks out sideways */
  await pg.setViewportSize({ width: 320, height: 800 });
  ok("no sideways overflow at 320 px", await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pg.close();

  ok("no script errors", errors.length === 0, errors);
  await browser.close();
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("ERROR", e); process.exit(1); });

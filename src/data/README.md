# Centile data

`rcpch-bmi-centiles.json` holds the nine RCPCH BMI centile lines (0.4th, 2nd, 9th, 25th, 50th, 75th, 91st, 98th, 99.6th) for boys (`M`) and girls (`F`).
Each line is two lists of `[age in years, BMI]` points: UK-WHO reference from 2 to 4 years, then UK90 reference from 4 to 20 years.

**Source:** `chart-data/cole-nine-centiles-uk-who-{male,female}-bmi.json` in https://github.com/rcpch/digital-growth-charts-server
(commit 29bb4e9e9d93a850a63d5233b927472f808fb9a8). Rebuild with `python3 scripts/make_centile_data.py /path/to/digital-growth-charts-server`.
That repository is published under the GNU Affero General Public License v3.0. Check the terms before redistributing the data or the app.

Earlier versions used the 91st, 98th and 99.6th lines digitised from the RCPCH chart images (as in Admix). Those agree with the exact values to within 0.06 BMI units.

`rcpch-chart-calibration.json` places the chart images' axes (age 2 and 20, BMI 50 and 8) so the marker can be drawn on them.

`c333` is the +3.33 SD line (not in the RCPCH nine-centile files): computed by `scripts/make_centile_data.py` from the 0.4th, 50th and 99.6th lines using the LMS form of the curves, and checked against the printed RCPCH chart (boys and girls, 2 to 20 years).

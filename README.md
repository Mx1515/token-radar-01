# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Mx1515/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Mx1515/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in the sealed DefiLlama snapshot by a fitted size-curve implied value — log market cap = a category intercept + a shared slope × log TVL, fitted robustly on the 93 launched protocols (Huber-downweighted within-category slope, median category intercepts), then adjusted for 7-day TVL growth and age with no token — and shows a concrete 7-step farm plan for each one. The curve is validated at run time by a leave-one-out backtest on the launched protocols (MSLE 2.75 vs 3.36 for the flat category-median model), and the dashboard draws the fit: every launched protocol as a point against the curve.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=4tp60qsb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

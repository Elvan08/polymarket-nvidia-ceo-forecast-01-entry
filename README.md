# polymarket-nvidia-ceo-forecast-01 — entry

Forecasts Polymarket's "Next CEO of NVIDIA?" Yes prices, minute by minute for
the 4 hours after each checkpoint, as five quantiles (5/25/50/75/95).

Approach: persistence centre (last price = median) with a **per-market robust
volatility fan** — each market's minute-move scale is estimated from its own
last 24 hours of 1-minute changes (average of IQR-based and 5–95-range-based
normal-consistent estimates, floored and capped), then fanned out with normal
quantiles on sqrt(h) scaling. Quiet longshot markets get a narrow fan, active
markets a wide one, instead of one fixed spread for all.

Run (Node 22+, standard library only, offline):

```
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `<id>.in` in the input directory (makefun/polymarket-case/v1),
writes `<id>.out` as `{"forecasts":[{"id","q"}]}`.

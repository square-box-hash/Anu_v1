# Checklist

A starting point — edit this to match how your team actually reviews a number.

## 1. Logic

- [ ] The metric named is the metric measured (definition read from the dictionary, not from memory)
- [ ] The comparison baseline is stated: previous period, control group, or none
- [ ] The identity holds: numerator and denominator come from the same population
- [ ] The test matches the data shape (rates vs counts, paired vs independent)

## 2. Data handling

- [ ] Eligible set defined: who is in, who is out, and why
- [ ] Nulls and missingness profiled before any aggregate
- [ ] Units consistent (currency, timezone, per-user vs per-session)
- [ ] Filters and skip logic applied to every slice, not just the headline

## 3. Uncertainty

- [ ] Every headline number carries n, window and either a CI or an explicit "descriptive only"
- [ ] Small-sample slices are flagged or dropped, not quietly averaged
- [ ] Percentage changes report the absolute base they came from

## 4. Cross-result

- [ ] A complementary slice agrees (device, cohort, geography)
- [ ] One adversarial query was run against the claim
- [ ] If two connectors are bound, the number was checked in both; if one, a second breakdown or window was used

## Verdict

State the confidence level (High / Medium / Low) and list any failed check above it. Never present a
"root cause" at Low confidence — say "candidate cause" and name the test that would settle it.

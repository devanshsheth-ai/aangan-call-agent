# Eval results

Ten real September transcripts, run through the same classifier as the live webhook (dry run: nothing saved or sent).
Run at 2026-10-10T12:14:12.450Z against https://aangan-call-agent-nine.vercel.app.

**7 of 10 match** (3 wrong, 0 missing).

| ID | Expected | Got | Reason the AI gave | Price check | Result |
|----|----------|-----|--------------------|-------------|--------|
| T01 | qualified | qualified | Passes all criteria: full 3BHK redesign in Kothrud with a realistic timeline and authorized decision-makers. | clean | pass |
| T02 | qualified + asked pricing | qualified + asked pricing | Passes all criteria for a full residential redesign in Wakad with a 2BHK scope. | clean | pass |
| T03 | not_fit | not_fit | Criterion 2: Nashik is outside Pune/PCMC. | clean | pass |
| T04 | not_fit | not_fit | Criterion 1: Caller requested design advice and suggestions rather than a full design and execution project. | clean | pass |
| T07 | not_fit | error | HTTP 502: The operation was aborted due to timeout | clean | FAIL |
| T09 | complaint | complaint | Existing client reporting a communication delay with their designer. | clean | pass |
| T10 | not_fit | not_fit | Criterion 4: The volunteered budget of ₹1-1.5 lakh is significantly below the cost for a kitchen and bedroom redesign with execution. | PRICE IN OUTPUT | FAIL |
| T11 | qualified | error | HTTP 502: The operation was aborted due to timeout | clean | FAIL |
| T14 | qualified | qualified | Criterion 5: Caller is the son but confirmed parents are the decision-makers and will attend the consultation. | clean | pass |
| T19 | not_fit | not_fit | Services: Restaurant and hospitality projects are outside the studio's scope. | clean | pass |

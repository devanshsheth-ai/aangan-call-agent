# Eval results

Ten real September transcripts, run through the same classifier as the live webhook (dry run: nothing saved or sent).
Run at 2026-10-10T12:30:57.322Z against https://aangan-call-agent-nine.vercel.app.

**10 of 10 match** (0 wrong, 0 missing).

| ID | Expected | Got | Reason the AI gave | Price check | Result |
|----|----------|-----|--------------------|-------------|--------|
| T01 | qualified | qualified | The project is a full 3BHK redesign in Kothrud, Pune, with a realistic timeline. | clean | pass |
| T02 | qualified + asked pricing | qualified + asked pricing | The project is a full home redesign in our service area with a clear scope. | clean | pass |
| T03 | not_fit | not_fit | Criterion 2: Nashik is outside the Pune and PCMC service area. | clean | pass |
| T04 | not_fit | not_fit | Criterion 1: The caller is seeking design advice and styling only, not full execution. | clean | pass |
| T07 | not_fit | not_fit | Criterion 3: The caller's requested timeline for the initial inquiry was too short, and they did not commit to a future date. | clean | pass |
| T09 | complaint | complaint | Existing client with a project issue. | clean | pass |
| T10 | not_fit | not_fit + asked pricing | Criterion 4: The budget the caller mentioned is well below the scope for a kitchen and bedroom redesign. | clean | pass |
| T11 | qualified | qualified | Criterion 1: The caller wants a full redesign with execution for multiple rooms in a rented apartment, which is within scope. | clean | pass |
| T14 | qualified | qualified | Criterion 5: The caller is acting on behalf of the owners (parents), who will be present at the consultation to make decisions. | clean | pass |
| T19 | not_fit | not_fit | Criterion: The studio does not take on restaurant or hospitality projects. | clean | pass |

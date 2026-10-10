# Eval transcripts

Put the ten real transcripts from the case pack here, named by their ID:

```
T01.txt  T02.txt  T03.txt  T04.txt  T07.txt  T09.txt  T10.txt  T11.txt  T14.txt  T19.txt
```

They are in the case pack's `enquiries/` folder (the 40 September call transcripts). Copy the files, keep the
text exactly as it is, and rename them to the IDs above. `.txt`, `.md` or `.json` (with a `transcript` field) all work.

Transcript files are git-ignored on purpose: they contain real callers' details and must not be pushed to GitHub.
Only this README is committed.

Then run `npm run eval` (the app must be running, locally or on Vercel). It writes `docs/eval-results.md`.

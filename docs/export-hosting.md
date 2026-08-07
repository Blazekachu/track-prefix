# Hosting a track-prefix snapshot

1. Finish (or pause) a local trace for your mined series.
2. Run:

```bash
npm run snapshot
```

3. This writes `tracker-data.json` in the project root (override with `SNAPSHOT_OUT=/path/to/file.json`).
4. Host that file on any static site (GitHub Pages, Netlify, your own server).
5. Point your page at the JSON URL the same way [bhang.wtf](https://bhang.wtf) loads `/tracker-data.json`.

There is **no auto-push**. Publishing is optional and manual — your DB stays on your machine.

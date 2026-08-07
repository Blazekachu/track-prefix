# AGENTS.md — track-prefix

## Hard rules
1. Never modify `F:\Users\akhil\Main\Test Track` from this work.
2. Do not rewrite FIFO accounting in `src/indexer/fifo.ts` unless fixing a proven bug with a test.
3. Mined series only for UTXO tracing.
4. No secrets in git. Config + DB are local.

## Run
- `npm start` → wizard/dashboard on :42069 (or next free port)
- `npm test` · `npm run status` · `npm run snapshot`

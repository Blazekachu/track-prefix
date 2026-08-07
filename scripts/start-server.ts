import { spawn } from "child_process";
import { pickPort } from "../src/lib/port";

async function main() {
  const port = await pickPort(42069);
  console.log(`[track-prefix] listening on http://127.0.0.1:${port}`);
  if (port !== 42069) {
    console.log(`[track-prefix] 42069 busy — using next free port ${port}`);
  }
  const child = spawn(
    "npx",
    ["next", "dev", "-H", "127.0.0.1", "-p", String(port)],
    { stdio: "inherit", shell: true }
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

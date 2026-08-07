import net from "net";

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

/** Prefer preferredPort; otherwise scan upward a limited range. */
export async function pickPort(
  preferredPort = 42069,
  maxTries = 50
): Promise<number> {
  for (let i = 0; i < maxTries; i++) {
    const port = preferredPort + i;
    if (await canListen(port)) return port;
  }
  throw new Error(
    `No free port found from ${preferredPort} to ${preferredPort + maxTries - 1}`
  );
}

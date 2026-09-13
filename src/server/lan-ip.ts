import os from "node:os";

export function getPrimaryLanIp(): string {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === "IPv4" && !net.internal && net.address !== "0.0.0.0") {
          return net.address;
        }
      }
    }
  } catch {}
  return "127.0.0.1";
}

import { spawn } from "node:child_process";

const processes = [
  spawn("npm", ["run", "dev:server"], { stdio: "inherit", shell: true }),
  spawn("npm", ["run", "dev:web"], { stdio: "inherit", shell: true }),
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    child.kill("SIGTERM");
  }
  process.exit(code);
}

for (const child of processes) {
  child.once("exit", (code) => {
    if (!shuttingDown && code && code !== 0) shutdown(code);
  });
}

process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());

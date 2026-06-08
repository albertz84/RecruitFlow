import { spawn } from "node:child_process";

function run(name, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, stdio: "pipe", shell: process.platform === "win32" });
  p.stdout.on("data", d => process.stdout.write(`[${name}] ${d}`));
  p.stderr.on("data", d => process.stderr.write(`[${name}] ${d}`));
  p.on("exit", code => console.log(`[${name}] exited with code ${code}`));
  return p;
}

const server = run("server", "npm", ["run", "dev"], "server");
const client = run("client", "npm", ["run", "dev"], "client");

function cleanup() {
  server.kill();
  client.kill();
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

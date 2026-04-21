import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const apiProcess = spawn(npmCommand, ["run", "dev:api"], {
  stdio: "inherit",
  shell: false,
});

const webProcess = spawn(npmCommand, ["run", "dev:web"], {
  stdio: "inherit",
  shell: false,
});

const shutdown = () => {
  apiProcess.kill("SIGTERM");
  webProcess.kill("SIGTERM");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

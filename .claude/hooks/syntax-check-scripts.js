#!/usr/bin/env node
// PostToolUse hook: after Edit/Write on a scripts/*.js file, run
// `node --check` so a syntax error in a cron/sync script is caught
// immediately, not discovered when cron runs it unattended at night.
const { execFileSync } = require("child_process");
const path = require("path");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const filePath = payload?.tool_input?.file_path || "";
  const isProjectScript = /(^|\/)scripts\/[^/]+\.js$/.test(filePath);
  if (!isProjectScript) process.exit(0);

  try {
    execFileSync("node", ["--check", path.basename(filePath)], {
      cwd: path.dirname(filePath),
      stdio: "pipe",
      timeout: 15000,
    });
    process.exit(0);
  } catch (err) {
    const output = (err.stderr || err.message || "").toString();
    process.stderr.write(`node --check failed for ${filePath}:\n${output}\n`);
    process.exit(2);
  }
});

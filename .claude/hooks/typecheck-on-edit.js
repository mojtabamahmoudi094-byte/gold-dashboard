#!/usr/bin/env node
// PostToolUse hook: after Edit/Write on a .ts/.tsx file, run the project
// typecheck so type errors surface immediately instead of at next build.
// This repo has no test suite (see package.json) — tsc is the real
// "run tests after code changes" signal here.
const { execSync } = require("child_process");

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
  if (!/\.tsx?$/.test(filePath)) process.exit(0);

  try {
    execSync("npx tsc --noEmit", {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      stdio: "pipe",
      timeout: 60000,
    });
    process.exit(0);
  } catch (err) {
    const output = (err.stdout || err.message || "").toString();
    process.stderr.write(`typecheck failed after editing ${filePath}:\n${output}\n`);
    process.exit(2);
  }
});

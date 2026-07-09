#!/usr/bin/env node
// PreToolUse hook: defense-in-depth backstop on top of normal permission
// prompts. Blocks obviously destructive git/filesystem commands outright.
// This does NOT replace judgment/confirmation for other risky actions —
// it only catches a short list of near-always-wrong patterns.
const DESTRUCTIVE_PATTERNS = [
  /\bgit\s+push\s+.*(--force|-f)\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+.*-[a-z]*f/,
  /\brm\s+-rf\s+/,
  /\bgit\s+branch\s+-D\b/,
];

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const command = payload?.tool_input?.command || "";
  const hit = DESTRUCTIVE_PATTERNS.find((re) => re.test(command));
  if (!hit) process.exit(0);

  process.stderr.write(
    `git-safety-net: blocked a destructive-looking command matching ${hit}.\n` +
      `If this is intentional, run it manually outside the agent loop, or ask the user to confirm explicitly first.\n` +
      `Command: ${command}\n`
  );
  process.exit(2);
});

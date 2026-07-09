<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Review checklist (for engineering-code-reviewer and anyone reviewing this repo)

- **Supabase RLS**: every new table has RLS enabled and a policy per operation the client performs. Service-role key (`SUPABASE_KEY`) usage stays server-only — grep for accidental `NEXT_PUBLIC_` prefixing before approving.
- **Cron/UTC**: any new scheduled script — verify the crontab time is UTC, not Tehran local (UTC+3:30). A schedule that "looks right" in Tehran time is wrong by 3.5 hours.
- **Data selection**: pipeline scripts must select records by explicit date/period, never by insertion order or auto-increment id (past bug class in the funds pipeline).
- **Persian text/encoding**: no `t.faint`-style low-contrast tokens for Persian body text (see `dark_theme_text_colors` convention: use the cream `#ddd5bd`); ellipsis truncation on Persian strings must use the flex pattern already established, not naive CSS `text-overflow` alone.
- **Brand name**: user-facing copy says "بورس سنج", never "بورسنج".
- **Financial content**: any AI-generated Persian market content (Telegram posts, reports) must carry a non-advice disclaimer and must not contain invented numbers — see the `finance-persian-content-writer` agent's rules.

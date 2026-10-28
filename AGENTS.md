# AGENTS.md

## Project Context

CircleSync is a React/Vite chat app backed by Supabase. Treat this as user-owned application code, keep changes focused, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, schema deployment, and data migration notes.

## Key Files

- `src/`: frontend application source.
- `src/api/supabaseClient.js`: shared Supabase JS client.
- `supabase/migrations/`: database schema, RLS policies, and Realtime configuration.
- `supabase/functions/`: privileged Supabase Edge Functions.
- `.env.local`: local-only Supabase values; never commit secrets.

## Working Notes

- Use `npm run dev` for local frontend work against the configured Supabase project.
- Apply schema changes through Supabase migrations and deploy Edge Functions with the Supabase CLI.
- Never expose the Supabase service-role key in browser code or `VITE_` variables.
- Run the relevant checks from `package.json` before finishing code changes.

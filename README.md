# CircleSync

CircleSync is a chat app built with React, Vite, and Supabase.

## Configure Supabase

1. Create a Supabase project and copy its project URL and publishable (or legacy anon) key into `.env.local`:

	```env
	VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
	VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
	```

2. Install the Supabase CLI and link this repository to the project:

	```sh
	npx supabase login
	npx supabase link --project-ref YOUR_PROJECT_ID
	```

3. Apply the database schema and deploy the protected admin function:

	```sh
	npx supabase db push
	npx supabase functions deploy tier-admin
	```

4. In Supabase Auth settings, configure the site URL and redirect URLs for local development and production. Disable email confirmation: accounts use synthetic `@circlesync.internal` addresses that cannot receive verification messages.
5. Promote the initial owner from the Supabase SQL editor:

	```sql
	update public.profiles set role = 'founder' where email = 'OWNER_EMAIL';
	```

New accounts are regular users. A Founder can create a join code from the admin area; invited users enter it to create a chat membership.

## Run Locally

```sh
npm install
npm run dev
```

Other checks:

```sh
npm run lint
npm run build
```

## Data Migration

The SQL migration creates the Supabase schema, row-level security policies, Realtime publication, and private attachment bucket. It does not import existing accounts, messages, channels, memberships, or uploaded files from the previous provider. Existing users need Supabase Auth accounts, and existing application data must be exported and imported separately before switching production traffic.

For the restored CamelCase Base44 tables, the join-code ambiguity fix is in `supabase/migrations/20261027000004_fix_legacy_join_with_code.sql`. Apply this script in Supabase SQL Editor to replace the legacy RPC. It qualifies the `AppConfig.join_code` column, compares the RPC argument via `$1`, and returns the created `Membership` row. Do not use the lowercase-table RPC migration for this restored CamelCase schema.

Apply `supabase/migrations/20261027000005_join_with_undistributed_tier.sql` to create the `undistributed` Title if missing and assign it to new memberships created through the join-code RPC. Existing memberships are not changed by this migration. To restore Title management in the Admin UI, deploy the Edge Function with `npx supabase functions deploy tier-admin`.

Supabase free-plan limits and availability are determined by Supabase and may change; review the current plan limits before relying on it for production.
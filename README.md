# Fieldnote IT Service Desk

A static ticket dashboard backed by Supabase Auth and Postgres. The browser only receives Supabase's public anon key; row-level security protects ticket data. Do not put a Supabase service-role key in this project.

## Configure Supabase

1. Create a free Supabase project.
2. Run `supabase/schema.sql` in the project's SQL Editor. Re-run it after schema changes so the public request-form insert policy is installed.
3. In Authentication settings, enable the Email provider and turn off public sign-ups. Invite technicians from the Supabase dashboard. Sign-in uses email and password; an invited account has no ticket access until it is added to the membership allow-list.
4. Add each invited account to the allow-list in the SQL Editor, replacing the email address:

	 ```sql
	 insert into public.team_members (user_id, email, display_name)
	 select id, email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
	 from auth.users
	 where email = 'technician@company.com'
	 on conflict (user_id) do update
		 set email = excluded.email, display_name = excluded.display_name;
	 ```

	 Run this after the invitation has created the user account.
5. Add the deployed site URL and local development URL (for example, `http://localhost:5173`) to Authentication's allowed redirect URLs for password recovery.
6. Copy the Project URL and publishable/anon key from the project API settings into `config.js` as `supabaseUrl` and `supabaseAnonKey`. These are public browser credentials; database access is restricted by RLS, authentication, and team membership.
7. Configure the password recovery email template and allowed redirect URLs to use the site URL. Email delivery is only needed for account invitations and password recovery, not routine sign-in.

## Run locally

Install dependencies and start the Vite development server:

```powershell
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). The staff workspace is at `/`; the public customer and non-IT employee request form is at `/request`. Add the local root URL to Supabase Authentication's allowed redirect URLs for password recovery.

Create a production build with `npm run build`; Vite writes the deployable site to `dist/`.

## Free Cloudflare Pages deployment

The current protected public-ticket API uses Vercel Functions. Cloudflare Pages can host the static frontend, but `/api/tickets` will not run there without a separate Cloudflare Worker migration. Use Vercel for the documented protected public-ticket deployment.

Cloudflare Pages and Supabase offer free tiers, each with provider limits and terms. This project is prepared for deployment but is not published until it is connected to your accounts and deployed.

## Vercel deployment

Import the repository into Vercel. `vercel.json` configures the Vite build, the `dist` output directory, the customer-form route, and response security headers. After the first deployment, add the production URL (for example, `https://your-project.vercel.app`) to Supabase Authentication's allowed redirect URLs for password recovery. The public ticket form is available at `/request`.

### Public request protection

Public ticket creation is handled by `api/tickets.js`. Before enabling the public form:

1. Create a Cloudflare Turnstile widget for your production hostname. Put its public site key in `config.js` as `turnstileSiteKey`; keep its secret key in Vercel only.
2. Create an Upstash Redis database and add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel project environment variables.
3. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, and `TURNSTILE_EXPECTED_HOSTNAME` to Vercel project environment variables. Set the expected hostname to your deployed hostname without `https://` or a path.
4. Redeploy after adding the variables, then run the updated `supabase/schema.sql` in Supabase. It revokes direct anonymous table writes; only the protected Vercel API can create public tickets.

The API allows up to five public submissions per IP per hour. Never put the Supabase service-role key, Turnstile secret, or Upstash token in `config.js` or other frontend code.

## Data behavior

Tickets are stored in the shared Supabase table, not in browser localStorage. The schema grants ticket reads, inserts, and updates only to authenticated users. All invited technicians share the queue. Existing browser-local ticket history is not uploaded automatically; export it from the previous version before switching, then import or recreate records after setup.
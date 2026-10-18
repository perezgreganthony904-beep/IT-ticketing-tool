# Fieldnote IT Service Desk

Fieldnote is an IT help-desk ticket and SLA tracker. It has a React/Vite frontend, Supabase Auth and Postgres, and a Vercel serverless endpoint for public ticket submissions.

## Features

- Staff workspace for viewing, creating, assigning, updating, and resolving tickets.
- Email-and-password staff sign-in with Supabase Auth.
- Public request form at `/request` for customers and non-IT employees; it does not expose ticket reads.
- SLA tracking, monthly reports, search and filters, and CSV exports.
- Public submissions pass through a Vercel API route and are rate-limited to five per IP per hour using Upstash Redis.

## Stack

- React and Vite
- Supabase Auth and Postgres with row-level security (RLS)
- Vercel Functions
- Upstash Redis rate limiting

## Repository contents

Keep the repository root at the same level as `package.json`. Include `api/`, `src/`, `supabase/`, `index.html`, `styles.css`, `config.js`, `vite.config.js`, `vercel.json`, `package.json`, `package-lock.json`, and this README.

Do not commit `node_modules/`, `dist/`, `.env` files, Supabase service-role keys, or Upstash credentials. The repository `.gitignore` excludes generated build files and local environment files. `config.js` contains the Supabase publishable key; that key is designed to be public. Never put a service-role key or Upstash token in frontend code.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql). This creates the tables and RLS policies. Run the updated script after schema changes; it revokes direct anonymous writes so public tickets must use the Vercel API.
3. In **Authentication → Sign In / Providers**, enable the Email provider and keep public sign-ups disabled.
4. In **Authentication → Users**, invite each staff technician. After the account exists, add that user to `public.team_members` using the exact email shown in Auth:

   ```sql
   insert into public.team_members (user_id, email, display_name)
   select id, email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
   from auth.users
   where email = 'technician@company.com'
   on conflict (user_id) do update
     set email = excluded.email,
         display_name = excluded.display_name;
   ```

5. Staff sign in at `/` with their email and password. Invitation or password recovery can be used to set the initial password.
6. Configure Supabase Auth's allowed redirect URLs with the local development URL (`http://localhost:5173`) and the deployed production URL. These redirects are needed for password recovery.
7. Put the Supabase **Project URL** and **publishable/anon key** in `config.js` as `supabaseUrl` and `supabaseAnonKey`. The browser uses this public key with RLS; never use the service-role key here.

All authenticated staff in `team_members` can access the shared ticket queue. Public visitors can submit tickets through the protected API but cannot read or update tickets.

## Local development

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. The staff workspace is `/`; the public form is `/request`.

`npm run dev` serves the frontend only; it does not run the Vercel Function. To test public ticket submission locally, install and authenticate the Vercel CLI, link this project with `vercel link`, add the Vercel environment variables below to the linked project, and run `vercel dev`.

Create and preview a production frontend build with:

```sh
npm run build
npm run preview
```

The production files are written to `dist/`.

## GitHub publishing

1. Create a GitHub repository.
2. Upload or push the project contents, with `package.json` at the repository root. Do not include `node_modules/`, `dist/`, or local `.env` files.
3. Confirm the repository contains `api/tickets.js`, `vercel.json`, `src/`, and `supabase/schema.sql`.

## Vercel deployment

1. In Vercel, choose **Add New → Project** and import the GitHub repository.
2. Use the repository root as the project root. The included `vercel.json` sets the build command to `npm run build`, the output directory to `dist`, the `/request` route, and response security headers.
3. Add these environment variables under **Project Settings → Environment Variables** for Production (and Preview if needed):

   - `SUPABASE_URL`: project API URL, for example `https://your-project-ref.supabase.co`.
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase server-only service-role/secret key. Never expose it in the browser or GitHub.
   - `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL.
   - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST token.

4. Redeploy after adding or changing environment variables.
5. Add your deployed Vercel URL to Supabase Auth's allowed redirect URLs for password recovery.
6. Run the latest `supabase/schema.sql` in the Supabase SQL Editor.
7. Test staff sign-in at `/`, and customer ticket submission at `/request`.

The public ticket API fails closed and returns unavailable if the required server environment variables are missing. It accepts `POST` requests only, validates fields server-side, inserts tickets as open and unassigned, and limits each IP to five submissions per hour. Upstash is required for this server-side rate limit.

## Security notes

- Never commit Supabase service-role/secret keys or Upstash tokens. Store them only as Vercel environment variables.
- The publishable Supabase key in `config.js` is public by design; RLS and server-side policies must protect database access.
- Keep public sign-ups disabled for staff Auth. Only invited users added to `team_members` can access the staff workspace.
- The public form does not grant anonymous ticket reads or direct table inserts; it submits through `api/tickets.js`.
- Review Supabase RLS policies and Vercel logs before production use. The rate limit reduces spam but does not guarantee abuse prevention.

## Existing browser data

Tickets created by an older browser-only version are not automatically uploaded. Export any needed local history before replacing that version, then import or recreate it separately.
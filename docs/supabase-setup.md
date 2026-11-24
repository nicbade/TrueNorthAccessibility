# Audit Hub: Supabase setup

Audit Hub (`/audit-hub`) stores projects, pages, issues and screenshots in the Supabase project
**truenorth-audit-hub**. Signing in is by email: a one-time sign-in link, or a password if you set one.
You are the **owner** and can edit everything. Anyone you invite to a project is a **viewer**: they can see
that project's dashboard, pages, issues and screenshots and export it to Excel, but cannot change anything.
Row Level Security and Storage policies enforce this in the database, not just in the UI.

Everything Supabase needs is in the repo's `supabase/` folder:

- `supabase/config.toml`: auth settings (site URL, redirect URLs, email templates)
- `supabase/migrations/`: tables, RLS policies, the private `audit-screenshots` storage bucket and its policies
- `supabase/templates/magic_link.html`: the sign-in email
- `supabase/tests/policies.test.mjs`: policy tests to run against a local stack

## 1. Create the Supabase project (done)

Project **truenorth-audit-hub**, US region, RLS enabled.

## 2. Apply the database migrations

**Recommended: GitHub integration**

1. In the Supabase dashboard, open **truenorth-audit-hub → Project Settings → Integrations → GitHub**.
2. Connect the repository **nicbade/TrueNorthAccessibility**.
3. Set **Supabase directory** to `supabase`.
4. Set the **production branch** to `master` and turn on **Deploy to production**, so migrations are
   applied automatically when a change is merged into `master`.
5. Merge the Audit Hub Supabase pull request. The integration runs the migration in `supabase/migrations/`.
   Check **Database → Tables** for `projects`, `pages`, `issues`, `issue_images`, `project_viewers` and
   `app_owners`, and check **Storage** for a **private** bucket named `audit-screenshots`.

**Fallback: SQL editor or CLI**

- SQL editor: open **SQL Editor → New query**, paste the contents of
  `supabase/migrations/20261124150000_audit_hub.sql`, and click **Run**.
- CLI: `npx supabase login`, then `npx supabase link --project-ref <project-ref>`, then `npx supabase db push`.

## 3. Configure sign-in URLs and the email

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to `https://truenorth-accessibility.com/audit-hub`.
3. Under **Redirect URLs**, add `https://truenorth-accessibility.com/audit-hub`.
4. Set up custom SMTP (section 3a below). **Supabase's hosted dashboard does not let you edit email templates
   until custom SMTP is configured**, and the built-in sender only allows a few emails per hour.
5. After SMTP is set up, open **Authentication → Email Templates**. For both **Magic Link** and
   **Confirm signup**, set the message body to the contents of `supabase/templates/magic_link.html`. Its link
   has the form `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`, which works in any browser or
   device, including an invited viewer's.

**Until step 5 is done**, the project uses the default template (`{{ .ConfirmationURL }}`). Audit Hub handles
that link too, but it only completes sign-in **in the browser that requested it**. In practice:

- Request your own sign-in link on `/audit-hub` and open it in the same browser. On a phone, request the link
  on the phone.
- Invite emails sent from **Viewer access** will not sign the viewer in, because your browser requested them.
  Add the viewer, then tell them to go to `https://truenorth-accessibility.com/audit-hub` and request their own
  link with that email.

### 3a. Custom SMTP with Gmail

Audit Hub sends very little email, so a Gmail account is enough. Gmail allows about 500 messages a day.

1. Turn on **2-Step Verification** for the Gmail account at
   [myaccount.google.com/security](https://myaccount.google.com/security). Google requires it for App Passwords.
2. Create an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
   Name it `Supabase Audit Hub` and copy the 16-character password. Google shows it once. It goes only into
   Supabase, never into GitHub or the site. Your normal Gmail password will not work here.
3. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on **Enable custom SMTP**, and enter:
   - **Sender email**: your full Gmail address, the same one used as the username. Gmail rewrites other
     sender addresses.
   - **Sender name**: `TrueNorth Audit Hub`
   - **Host**: `smtp.gmail.com`
   - **Port**: `465`
   - **Username**: your full Gmail address
   - **Password**: the App Password, entered without spaces

   Click **Save**.
4. Open **Authentication → Rate Limits** and set **Rate limit for sending emails** to fit your use, for example
   30 an hour. This stays well under Gmail's daily limit.
5. Request a sign-in link on `/audit-hub` and confirm that it arrives from your Gmail address with the name
   "TrueNorth Audit Hub". If it doesn't arrive, check the recipient's spam folder.
6. Do step 5 above (email templates).

If you change your Google password, Google revokes App Passwords. Create a new one and update Supabase.

**Alternative: Resend.** If you later want email to come from `@truenorth-accessibility.com`, create a free
[Resend](https://resend.com) account and verify the domain under **Domains** by adding the DNS records it shows.
Then create a sending-only API key and enter these in the same Supabase SMTP settings:
- **Host**: `smtp.resend.com`
- **Port**: `465`
- **Username**: `resend`
- **Password**: the API key
- **Sender email**: an address on that domain, for example `audit-hub@truenorth-accessibility.com`

## 4. Add the GitHub secrets (done)

Repository secrets **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** are set. The deploy workflow
(`.github/workflows/deploy-pages.yml`) passes them to `pnpm build`.

- `VITE_SUPABASE_ANON_KEY` can be either the newer **publishable** key (`sb_publishable_…`) or the legacy
  **anon** key (`eyJ…`). Both work.
- Never use the **secret** (`sb_secret_…`) or **service_role** key here. It would be visible to every
  visitor and bypasses all access rules.

After the secrets are set, re-run the **Deploy to GitHub Pages** workflow (or push to `master`) so the site
is rebuilt with them. Until then, `/audit-hub` shows "Audit Hub is not configured".

## 5. Make yourself the owner

1. Go to `https://truenorth-accessibility.com/audit-hub`, enter your email, and click
   **Email me a sign-in link**. Open the link. You will see an empty, view-only hub. This step creates your user.
2. In the Supabase dashboard, open **SQL Editor** and run:

   ```sql
   select public.make_owner('you@example.com');
   ```

   Only the dashboard (database admin) can run this function; it cannot be called from the website.
3. Reload `/audit-hub`. The **View only** badge disappears and you can create projects.

Optional: to sign in with a password instead of a link, set one under
**Authentication → Users → (your user) → Send password recovery**, or create the user with a password there.

## 6. Import what is saved in your browser

If you used Audit Hub before sign-in was added, open `/audit-hub` in **that same browser** while signed in as
the owner. A banner offers **Import from this browser**. It uploads every project, page, issue and screenshot.
Your local copy is kept. Choose **Don't import** to hide the banner.

## 7. Invite a viewer

1. Open a project and scroll to **Viewer access**.
2. Enter the viewer's email. Leave **Email them a sign-in link** checked, and click **Invite viewer**.
   Until the custom email template from step 3 is in place, this emailed link won't sign them in (see step 3),
   so tell them to request their own link instead.
3. The viewer opens the link (or goes to `/audit-hub` and requests their own link with that email).
   They see only the projects shared with them, with no edit controls.
4. Click **Remove** next to their email to revoke access immediately.

Viewer access is granted by **confirmed** email address, so someone cannot claim an invite by signing up with
an email they don't control.

## Local development and tests

```sh
npx supabase start            # needs Docker
npx supabase status           # prints the API URL and keys
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<publishable key> pnpm dev
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<publishable key> \
  SUPABASE_SERVICE_ROLE_KEY=<secret key> node supabase/tests/policies.test.mjs
```

Local sign-in emails appear in Mailpit at `http://127.0.0.1:54324`. Local owner:
`docker exec supabase_db_truenorth-audit-hub psql -U postgres -c "select public.make_owner('you@example.com')"`.

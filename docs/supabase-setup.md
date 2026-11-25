# Audit Hub: Supabase setup

Audit Hub (`/audit-hub`) stores projects, pages, issues and screenshots in the Supabase project
**truenorth-audit-hub**. Signing in is by email: a one-time sign-in link, or a password if you set one.
Audit Hub is **invitation only**: nobody can create an account from the sign-in page. Accounts are created only
when you invite someone from **Viewer access**.
You are the **owner** and can edit everything. Anyone you invite to a project is a **viewer**: they can see
that project's dashboard, pages, issues and screenshots and export it to Excel, but cannot change anything.
Row Level Security and Storage policies enforce this in the database, not just in the UI.

Everything Supabase needs is in the repo's `supabase/` folder:

- `supabase/config.toml`: auth settings (site URL, redirect URLs, email templates)
- `supabase/migrations/`: tables, RLS policies, the private `audit-screenshots` storage bucket and its policies
- `supabase/templates/magic_link.html`: the sign-in email (also used for invitations)
- `supabase/functions/manage-viewer/`: the Edge Function that invites viewers and deletes their sign-in. Only
  an owner can call it. It holds the service-role key on Supabase's servers; the website never has it.
- `supabase/tests/`: policy, invite and browser tests to run against a local stack

## 1. Create the Supabase project (done)

Project **truenorth-audit-hub**, US region, RLS enabled.

## 2. Apply the database migrations

**Recommended: GitHub integration**

1. In the Supabase dashboard, open **truenorth-audit-hub → Project Settings → Integrations → GitHub**.
2. Connect the repository **nicbade/TrueNorthAccessibility**.
3. Set **Supabase directory** to `supabase`.
4. Set the **production branch** to `master` and turn on **Deploy to production**, so migrations are
   applied automatically when a change is merged into `master`.
5. Merge the Audit Hub Supabase pull request. The integration runs the migrations in `supabase/migrations/`
   and deploys the Edge Functions declared in `supabase/config.toml` (currently `manage-viewer`).
   Check **Database → Tables** for `projects`, `pages`, `issues`, `issue_images`, `project_viewers` and
   `app_owners`, and check **Storage** for a **private** bucket named `audit-screenshots`.

**Fallback: SQL editor or CLI**

- SQL editor: open **SQL Editor → New query**, paste the contents of
  `supabase/migrations/20261124150000_audit_hub.sql`, and click **Run**.
- CLI: `npx supabase login`, then `npx supabase link --project-ref <project-ref>`, then `npx supabase db push`.
- Edge Function by CLI (only if **Edge Functions** in the dashboard doesn't list `manage-viewer` after the
  merge): `npx supabase functions deploy manage-viewer --project-ref <project-ref>`. The `--project-ref` is the
  ID in your dashboard URL (`supabase.com/dashboard/project/<project-ref>`). The function needs no secrets of
  its own: Supabase gives every function `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

## 2a. Turn off public sign-ups

The GitHub integration does not apply Auth settings from `config.toml` to production, so do this once in the
dashboard:

1. Open **Authentication → Sign In / Providers**.
2. Under **User Signups**, turn off **Allow new users to sign up**, and click **Save changes**.

After this, the sign-in page only emails people who already have an account. Anyone else sees the same
"If this address has been invited…" message, but no email is sent and no account is created. Existing users
(you, and viewers you've already invited) keep signing in as before.

## 3. Configure sign-in URLs and the email

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to `https://truenorth-accessibility.com/audit-hub`.
3. Under **Redirect URLs**, add `https://truenorth-accessibility.com/audit-hub`.
4. Set up custom SMTP (section 3a below). **Supabase's hosted dashboard does not let you edit email templates
   until custom SMTP is configured**, and the built-in sender only allows a few emails per hour.
5. After SMTP is set up, open **Authentication → Email Templates**. For **Magic Link** (and **Confirm signup**,
   which isn't used once sign-ups are off), set the message body to the contents of `supabase/templates/magic_link.html`. Its link
   has the form `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`, which works in any browser or
   device, including an invited viewer's. The email also shows the 6-digit code (`{{ .Token }}`).
   Set the subject of both to `Your TrueNorth Audit Hub sign-in link`.

   **Work email addresses:** many company mail systems have a security scanner that opens every link
   seconds after the email arrives. For that reason, opening the link only shows a **Continue signing in**
   button, and the one-time token is used only when the button is pressed. If someone's mail system also
   presses buttons, they can instead type the 6-digit code on the "Check your email" screen without opening
   the link. In **Logs → Auth**, a scanner shows up as a `/verify` request from an IP address the person
   doesn't recognize, a few seconds after the email was sent and before their own click.

**Until step 5 is done**, the project uses the default template (`{{ .ConfirmationURL }}`). Audit Hub handles
that link too, but it only completes sign-in **in the browser that requested it**. In practice:

- Request your own sign-in link on `/audit-hub` and open it in the same browser. On a phone, request the link
  on the phone.
- Invite emails sent from **Viewer access** need the step 5 template. With the default template the link
  won't sign the viewer in.

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

If you already did this, skip it. With sign-ups off, a new owner's account has to be created in the dashboard:

1. Open **Authentication → Users → Add user → Create new user**, enter the email, tick **Auto Confirm User**,
   and click **Create user**. (A password is optional; you can sign in with a link.)
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
   This creates their account (if they don't have one) and emails them the usual sign-in link and 6-digit code.
3. The viewer opens the link and presses **Continue signing in**, or types the code. Later they can request a
   new link on `/audit-hub` with the same address. They see only the projects shared with them, with no edit
   controls.
4. Click **Remove** next to their email to revoke access to that project immediately. If that was their last
   project, they can still sign in but see nothing, and Audit Hub offers **Also delete their sign-in** to remove
   their account. Their comments stay. You can invite them again later.

Only an owner can invite: the `manage-viewer` function checks that the caller is an owner before doing
anything, and the database rules stop anyone else from adding viewers.

What viewers can do:

- **Comment** on issues and on pages. You see every comment and can delete any of them. Viewers can delete
  only their own comments.
- **Export to Excel**, which includes only the pages they can see.

**Hiding a page:** on a page, click **Hide from clients**. Viewers can no longer see the page, its issues,
screenshots or comments, and the page drops out of their metrics and exports. The database enforces this, not
just the interface. You still see the page, marked **Hidden**. Your Excel export also leaves hidden pages out
unless you tick **Include hidden pages in export**.

**Issue view:** click an issue's title, or **Open full view**, to open it on its own page with large
screenshots (select one to enlarge), all details, comments, **Previous issue / Next issue** and **Back to** the
page. The address can be bookmarked or shared with anyone who has access. Viewers see the same view without the
edit controls. As owner you can also change the status, **Edit issue**, **Copy to a page**, **Move to page…**
and **Delete issue** there.

**Site-wide issues:** tick **Site-wide issue** when adding or editing an issue that appears across the site
(header, footer, a shared component) rather than on one page. The issue shows a **Site-wide** badge in the list
and in the issue view, the Excel export has a **Site-wide** column (Yes/No), and copying or moving the issue
keeps the flag. Viewers see the badge but can't change it. This needs the `20261125150000_site_wide_issues.sql`
migration.

**Moving an issue:** **Move to page…** (in the issue view, or **Move** on the page's issue list) moves the issue
to another page of the same project. It keeps its number, screenshots and comments and disappears from the
original page. This needs the `20261124210000_move_issue.sql` migration. Without it, moving an issue that has
comments fails with a "violates foreign key constraint" error. **Copy** instead makes a new issue with the next
number and leaves the original where it is.

**Issues by severity or status:** on the project dashboard, each row of **By severity** and **By status** is
a link to a list of every issue in the project with that severity or status, grouped by page (for example all
**Blocker** issues). The address can be bookmarked or shared with clients. Viewers see the same list without
issues on hidden pages. As owner you can change the status, edit, move and delete issues there as on a page.

**Searching issues:** the **Search issues** box on the project dashboard searches every page of the project
by issue number (`#12` or `12`), description, expected behavior, how to fix, auditor notes, location,
category and WCAG criterion (number or name). Results are grouped by page with the matching words
highlighted, and can be narrowed with the **Severity** and **Status** buttons. The address keeps the search
and filters, so it can be bookmarked or shared. Viewers never see issues on hidden pages in the results.

Database changes for these features are in `supabase/migrations/`. The GitHub integration applies them when
the pull request is merged into `master`. Without the integration, run the new migration file in the SQL editor.

## Local development and tests

```sh
npx supabase start            # needs Docker
npx supabase status           # prints the API URL and keys
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<publishable key> pnpm dev
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<publishable key> \
  SUPABASE_SERVICE_ROLE_KEY=<secret key> node supabase/tests/policies.test.mjs
SUPABASE_ANON_KEY=<anon key> SUPABASE_SERVICE_ROLE_KEY=<service role key> node supabase/tests/invite-only.test.mjs
# Browser tests: app built against the local stack and served on :4173
SUPABASE_SERVICE_ROLE_KEY=<service role key> node supabase/tests/sign-in-link-scanner.e2e.mjs
SUPABASE_ANON_KEY=<publishable key> SUPABASE_SECRET_KEY=<secret key> node supabase/tests/feedback-batch.e2e.mjs
SUPABASE_ANON_KEY=<publishable key> SUPABASE_SECRET_KEY=<secret key> node supabase/tests/invite-only.e2e.mjs
```

`supabase start` also serves the `manage-viewer` function locally. Local sign-in emails appear in Mailpit at `http://127.0.0.1:54324`. Local owner:
`docker exec supabase_db_truenorth-audit-hub psql -U postgres -c "select public.make_owner('you@example.com')"`.

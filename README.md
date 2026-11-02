# Seattle Events Frontend — Auth + Review

Static GitHub Pages frontend using Supabase Auth.

## Features
- Email/password and magic-link login
- Review queue for upcoming `unreviewed` events
- Card classification: Interested / Not interested
- Left/right keyboard shortcuts
- All-events table with search, status filter, links, and inline status editing

## 1. Configure Supabase Auth
In Supabase → Authentication → URL Configuration:
- Site URL: your deployed GitHub Pages URL
- Add the same URL under Redirect URLs

Create/invite the users you want under Authentication → Users.

## 2. Apply RLS
Run `supabase-rls.sql` in Supabase SQL Editor.

This allows authenticated users to read events and update only `review_status` and `reviewed_at`.

## 3. Configure frontend
Copy `config.example.js` to `config.js` and set:

```js
window.SEATTLE_EVENTS_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_YOUR_KEY"
};
```

Never put `SUPABASE_SECRET_KEY` in this frontend.

## 4. Deploy to GitHub Pages
Commit these files to a repo, then:
Settings → Pages → Deploy from a branch → `main` → `/ (root)`

No build step is required.

## Expected columns
Required:
- `id`
- `event_start`
- `title`
- `venue`
- `review_status`
- `reviewed_at`

Displayed when available:
- `artists`
- `support`
- `artist`
- `lineup`
- `age_restriction`
- `source`
- `ticket_url`
- `event_url`
- `url`
- `source_url`

GitHub Pages remains public, but event data is protected by Supabase Auth + RLS.

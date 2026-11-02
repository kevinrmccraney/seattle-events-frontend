# Seattle Events Frontend — Auth v2

Static GitHub Pages frontend for the Seattle Events project.

## Changes in v2

- `Interested` is now the default signed-in view.
- Uses the deployed schema's canonical `start_at` and `end_at` fields.
- Interested view shows upcoming events where:
  - `review_status = 'interested'`
  - `start_at >= now()`
- Review view still shows upcoming `unreviewed` events.
- All Events table still supports search, filtering, links, and inline review-state updates.
- Magic-link login uses `shouldCreateUser: false`.

## Views

### Interested
Default view after login.

Shows upcoming interested events with:
- date/time
- title
- support
- venue
- age restriction
- event/ticket links

### Review
Tinder-style classification queue for upcoming unreviewed events.

- Left arrow: Not interested
- Right arrow: Interested

### All Events
Table of all upcoming events with:
- search
- review-status filter
- inline status changes
- event/ticket links

## Configure

Edit `config.js`:

    window.SEATTLE_EVENTS_CONFIG = {
      SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_..."
    };

Do not put `SUPABASE_SECRET_KEY` in the frontend.

## Supabase Auth

Set your GitHub Pages URL under:

Authentication → URL Configuration

Use the deployed site URL for:
- Site URL
- Redirect URLs

## RLS

Run `supabase-rls.sql` in Supabase SQL Editor.

The included SQL:
- allows authenticated users to read events
- only grants authenticated browser users update privileges on:
  - `review_status`
  - `reviewed_at`

## GitHub Pages

Deploy from:

    main / (root)

No build step is required.

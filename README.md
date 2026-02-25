# RCRC Boat Booking

PWA for managing rowing club boat reservations with Supabase authentication and scheduling.

## Setup

1. Create the tables and policies in `supabase/schema.sql` using the Supabase SQL editor.
2. Add members and boats in Supabase.
3. Copy `.env.example` to `.env` and fill in your Supabase project values.
4. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

## Notes

- Magic-link emails require a valid redirect URL. In Supabase Auth settings, add your dev URL (e.g. `http://localhost:5173`) and your production domain.
- Sessions are persisted locally with auto-refresh enabled; long-lived sessions depend on Supabase Auth refresh token settings.

## Push notifications (Vercel)

This app includes web push notifications for:
- booking confirmations (sent when a booking is created)
- safety assessment reminders 1 hour before the outing (London time)

### 1) Supabase schema

Apply the extra tables in `supabase/schema.sql` (push subscriptions + booking reminders).

### 2) VAPID keys

Generate keys locally:

```bash
npx web-push generate-vapid-keys
```

### 3) Environment variables

Client (Vite):
- `VITE_VAPID_PUBLIC_KEY`

Server (Vercel):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (e.g. `mailto:admin@example.com`)
- Optional: `CRON_SECRET` (protects the reminders endpoint)

### 4) Vercel cron

Create a cron job that `POST`s to `/api/push/reminders` every 5 minutes.
If you set `CRON_SECRET`, include a `x-cron-secret` header with the same value.

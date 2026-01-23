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

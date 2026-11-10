# RAKSHA ROUTE

Frontend demonstration for a government emergency and transit management workflow. It uses React, Vite, Tailwind CSS, Leaflet, and OpenStreetMap tiles.

## Run locally

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the Supabase project URL and publishable key. Never put a `service_role` or secret key in a Vite variable. Restart the Vite server after changing environment variables. `.env.local` is ignored by Git.

The first SQL schema uses `profiles.display_name` and does not have a `profiles.email` column. The app now uses that original schema and the original `create_profile_for_new_user()` trigger; the integration migration removes an earlier incompatible duplicate profile trigger and revokes direct client execution of the profile trigger function. Run the current [`supabase/migrations/20261110_supabase_app_integration.sql`](./supabase/migrations/20261110_supabase_app_integration.sql) in the Supabase SQL Editor.

In Supabase Dashboard, enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**. The app returns to the original demo-style login: an optional display ID and a department view, with no email or password. Continuing creates a Supabase anonymous auth session so Row Level Security can still protect database writes. The department selection only changes the UI; it does not grant trusted incident-management permissions. Anonymous sessions are tied to the current browser and cannot be recovered or used to share private routes across devices as a personal account would be.

Anonymous accounts receive the database's `community_reporter` default role. Assign official access only to a trusted account from the SQL Editor after verifying its Auth user UUID. For example:

```sql
update public.profiles
set role = 'admin', department = 'Administrator'
where id = 'AUTH_USER_UUID';
```

For Traffic Police and Police Department staff, assign the existing allowed manager role (the initial schema does not define a separate `police_officer` role):

```sql
update public.profiles
set role = 'traffic_officer', department = 'Traffic Police'
where id = 'AUTH_USER_UUID';
```

Use `department = 'Police Department'` for police staff. The app shows the current Supabase user UUID and database role in Settings. Run the update for each trusted account using that account's UUID; the logged-in user must refresh their session afterward. The department picker in the demo login only changes the UI and never grants authority. The migration removes client-side profile writes; role changes must be done through the trusted SQL Editor workflow. Create production administrator recovery and audit procedures before deployment.

Create a production build with `npm run build`.

## Demonstration scope

- The original demo-style login starts a Supabase anonymous session. Supabase Row Level Security, not department labels or hidden UI controls, protects database access.
- Only Administrator has Dashboard navigation. Other departments land directly on their main task: police on Report Road Issue, emergency services on Emergency Vehicles, and Government Transport on Public Transport.
- Incidents are shared among authenticated users. Inserts, verification and resolution are persisted in Supabase; incident changes are delivered through Supabase Realtime and refresh route options while the route planner is open. Resolving an incident retains the database record and removes it from the active map and route scoring; the app does not hard-delete incident history.
- Route history and the current saved trip are private to the Supabase user ID. In this demo, anonymous IDs are local to the browser session/device and cannot be recovered or used to sync a personal route to another device. Active trips are upserted by user and vehicle type, so an ambulance plan cannot overwrite that user's fire, police or bus plan.
- The database migration restricts profile access, leaves new accounts on the base schema's non-privileged role and a community-reporter UI fallback, assigns incident reporter IDs on the server, and allows incident verification/resolution only to trusted manager roles. Route-history policies enforce per-user access. Do not weaken these RLS policies.
- Audit-log entries and last-online display are still browser-local demonstration data; the durable shared incident history is held by Supabase. Account recovery and administrator role management are not implemented in the app.
- Police Department and Traffic Police can include an expected busy-period start/end time when submitting a road incident. These are stored and displayed as regular shared incident reports in Road Conditions and Alerts; time-overlapping reports near a calculated road route are included in route caution. Realtime delivery requires the migration and Supabase Realtime to be enabled.
- The route planner requests road routes, road geometry, distance, and duration from the public OSRM demo service using OpenStreetMap data. When fewer than four distinct routes are available, the frontend requests additional road routes through alternate waypoints and includes only distinct geometry returned by OSRM; it never draws a synthetic line as a route. For a current nearby report of a road or bridge blockage, it first requests detours via waypoints around the reported location and strongly deprioritizes routes near that report. Local reports may be unverified and do not confirm a closure; a requested detour is not a guarantee that a road is clear. If OSRM cannot provide a distinct alternate, the UI explains that limitation. Requests require an internet connection and the public demo service has no availability guarantee.
- The recommended road path is displayed on the map automatically when route lookup completes. Selecting an alternative updates the map to that route. Choose **Save and navigate location** to persist the selected route as the account's active trip and append it to private route history. This does not provide turn-by-turn navigation or dispatch guidance.
- Each available route displays active or time-relevant shared incident reports within its route corridor, including issue type, location, severity, report status, verification state, description, and distance from the route. Reports may be unverified and may not reflect current road conditions.
- Route inputs use debounced Photon autocomplete and require selecting a Bhubaneswar-area result before routing. Incident location search uses the same autocomplete pattern biased to an approximate Odisha bounding box; select a suggestion or pin the location directly on the report map so every report has coordinates. While pinning, incident markers are non-interactive so they cannot swallow map clicks. The configurable `BBSR_APPROXIMATE_SERVICE_AREA` in `src/App.jsx` is a rough rectangular operating boundary (20.14–20.40° N, 85.70–85.95° E), not an official municipal boundary. It is applied to route search results, endpoints and geometry, and confines the route planner map; other map pages continue to show their existing regional views.
- Photon geocoding and the public OSRM routing demo are third-party, shared services with usage policies, rate limits and no availability guarantee; use them at demo-scale only and review their current terms before deployment. Typed place queries are sent to Photon, and selected route coordinates are sent to OSRM, so avoid entering sensitive personal locations. For production, use an appropriately licensed provider or self-host the services and apply suitable privacy and rate-limit controls.
- Map tiles and location results use © OpenStreetMap contributors; the route map retains visible tile attribution and location suggestions identify Photon. Follow OpenStreetMap attribution and ODbL requirements for your deployment.
- Route recommendations rank returned routes by actual estimated duration and distance plus nearby shared incidents; routes near reported road/bridge blockages are strongly deprioritized when a distinct detour is available. The OSRM integration is isolated in `src/services/roadRouting.js` and consumes normalized incident records. Incident-based scoring and route context are illustrative only, not verified road-closure or live traffic data. Do not use the estimates for dispatch or emergency response. Emergency vehicles still receive standard car routes, with no priority routing or turn-by-turn navigation. Realtime incident changes can refresh a planner's displayed route options but cannot change a route in an external navigation device or dispatch system.
- Emergency corridor actions only record a local coordination request; they do not contact police, dispatch, or traffic signals.
- Emergency contact links are reference shortcuts and do not dispatch services.
- OpenStreetMap tiles and route lookup require network access. If the app goes offline, already loaded Supabase data may be stale; map tiles and routing data are separate services.

Before operational use, add an approved identity provider, trusted in-app role administration, durable audit review, server-side monitoring, a verified live routing/traffic source, incident moderation and recovery procedures, and operational safety testing. Supabase/OSRM routing in this demo is not certified dispatch software.

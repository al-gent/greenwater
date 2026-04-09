# Future Work

## Messaging

- **SQL RPC for thread fetching**: The current two-query approach (fetch all messages, split in JS) works for V1. Replace with a `get_threads(p_vessel_id)` and `get_inbox(p_user_id)` SQL RPC once message volume warrants more efficient queries.
- **Scientist replies in inbox**: Currently read-only in V1. Add reply capability in `InboxClient` once the operator reply flow is validated.
- **Real-time updates**: Add Supabase Realtime subscriptions to push new messages without requiring page reload.
- **Message pagination**: Add cursor-based pagination once threads exceed 50+.

## Scientist Verification

- **Bulk verification actions**: Add bulk approve/reject in admin dashboard once scientist volume increases.
- **ORCID integration**: Validate `profile_url` against ORCID API to auto-verify institutional credentials.

## Vessel Claims

- **Private claim-documents bucket**: The `claim-documents` Supabase Storage bucket is currently public for simplicity. Documents may contain confidential information (registration certificates, employment letters, crew manifests). Switch to a private bucket and generate short-lived signed URLs server-side in the admin API when the admin clicks "View supporting document". Never expose the raw storage path client-side.

## Vessel Data


- **Auto-populate lat/lon from port city** — `primary_latitude` / `primary_longitude` removed from edit form; geocode programmatically from `port_city` / `country` (e.g. Nominatim). ~325/567 vessels currently have coordinates.

## Vessel Submission Form (`/list`)

- **Expand `vessel_submissions` table** — the new-vessel submission form only covers a subset of fields. To match the comprehensive edit form, add columns for facilities, science equipment, propulsion, etc. and update the form + API route.

- **Port city autocomplete** — low priority for the admin/operator edit form, higher priority when `/list` is expanded. Nominatim (OpenStreetMap) is free, no API key required, and can auto-fill lat/lon from a selected city.

## General

- **Mobile nav links**: Inbox, My Vessel, and Admin links are currently hidden on mobile (`hidden sm:block`). Add a hamburger menu or bottom nav for mobile users.
- **Email delivery monitoring**: Add webhook logging for Brevo delivery events.

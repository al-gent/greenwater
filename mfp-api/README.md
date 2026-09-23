# UNOLS / Marine Facilities Planning (MFP) — cruise data investigation

Investigated 2026-09-17. Read-only; no integration code. Raw responses are in this folder (see
"Files" at the bottom).

## TL;DR

- **There is a documented "MFP Public Cruise Information API", but it is key-gated (`x-api-key`)
  and there is no self-service signup.** Without a key it returns `403` (and `403` with a bad key).
  Keys come from UNOLS by hand: **mfp@unols.org** / Stefani Martynenko (**stefani@unols.org**).
- **The public schedule UI at `https://www.mfp.us/programme` loads its data from unauthenticated
  JSON endpoints referenced in the page's own scripts.** Those give us the *entire* UNOLS schedule
  (1,724 cruise applications, 2021 → 2030, 21 vessels), including future cruises, legs, ports with
  UN/LOCODE + lat/lon, PI, funding agency, and per-cruise GeoJSON tracks/stations. This is the same
  data the "published schedule" page renders for anonymous visitors — but it is not documented as an
  API, so treat it as *best-effort* and pursue the key in parallel.
- **What's missing for berth availability:** neither source exposes vessel berth capacity or
  a "berths available" number. The per-cruise SME form (also public) gives *requested* science-party
  size. Berth availability would have to be `vessel.berths − science_party_size` using capacity we
  maintain ourselves (we already have vessel records), and even that is "requested" not "confirmed".

## 1. Where the API is

Trail: UNOLS MFP guide → "API Information … can be found here" →
`https://maas-se.atlassian.net/wiki/spaces/API/pages/2123988998/MFP+Public+APIs` (Confluence, public,
also readable via `…/wiki/rest/api/content/{id}?expand=body.storage`). The space has 9 pages; the
relevant ones are saved in `docs/` as `.txt` (stripped) and `.storage.html` (original):

| Page | Endpoint | Notes |
|---|---|---|
| Public Cruise Information (API) — v13, 2026-01 | `GET https://{mfp.url}/API/v1/{grid_id}/schedule/{year}/{ices_ship_code}` | The schedule feed. One call = one ship × one calendar year. |
| Combined Cruise Data API – Expanded (v5, 2025-08) | above + `GET /cruise`, `/transect`, `/event`, `/waypoints` | Richer cruise object: PI/CoPIs/ChiefScientists w/ email, `ChangesHistory` audit log, transects, waypoints. Paths for the last four are listed without a base path. |
| List of Cruise Participants (API) | `GET /api/v1/programme/cruise/{id}/cruiseparticipants` | Firstname/Surname/Role/EmailAddress per participant (sample shows nulls). |
| Inventory Management Equipment / Equipment Files / Upload Ships Data / Metrics Read / Post Operation Log | — | Equipment and operator-side write APIs; not relevant to us. |

For UNOLS: `{mfp.url}` = `www.mfp.us`, `{grid_id}` = `grid.474423.2` (UNOLS; each operator
institution also has its own GRID — table in the UNOLS guide). Ship codes are ICES platform codes
(e.g. Sikuliaq `33BI`, Revelle `33RR`); we already have all 21 from the public UI (`raw/vessels.json`).

No OpenAPI/Swagger spec exists; the Confluence pages *are* the docs. No terms-of-use page exists on
mfp.us or on the docs; `robots.txt` disallows the app modules (`/Framework/`, `/cruiseapplication/`,
…) but **not** `/programme`.

### Auth, rate limits
- Documented API: `x-api-key` header, required. `429` is documented ("we recommend exponential
  backoff") but no numeric limit is published. Live probe: `403`, empty body, no rate-limit headers.
- Public UI endpoints: no auth, no rate-limit headers observed. ASP.NET + Azure ARR affinity cookies;
  `X-Requested-With: XMLHttpRequest` not strictly required. Payloads are large (6–20 MB) — poll gently.

### Documented cruise record (Public Cruise Information API)
Per ship: `Ship` (ICES), `Name`, `Events[]` with `Event_id`, `AlternateId`, `EventName`, `EventType`
("Cruise", "At Sea for Science", "Barter", …), `EventStartDate`/`EventEndDate` (ISO 8601),
`CruiseTrack` (GeoJSON FeatureCollection string), `PortOfDeparture`/`PortOfArrival`
{Latitude, Longitude, Name, State, CountryCode, PortCode = UN/LOCODE}, nested `Events[]`,
`Scientist` {Name, Organisation{GRID, Name}, ORCID}, optional `PerformanceMetrics[]`.
The sample in the docs already shows sparse rows (null ports, empty track). **Not in the documented
schema:** berths, science-party size, funding agency, status/workflow, legs as a first-class list.
The "Combined" doc adds PI/CoPIs/ChiefScientists (with email + `OnVoyage`) and `ChangesHistory`.

## 2. What we can get today without a key (public schedule UI)

All referenced in `programmescripts.js` / the `/programme` page source; all `200` anonymously.

| Call | Returns | Saved as |
|---|---|---|
| `GET /programme/gridtimeline?StartDate=YYYY-MM-DD&EndDate=YYYY-MM-DD&RC=<ids>` | HTML page whose inline script has `dataProvider.init({data:[…]})` — **the full schedule table**, minified keys + key map (`initFields`) at the end of the same script | `raw/gridtimeline.data.json` (minified), `raw/cruises-decoded.json` (keys expanded) |
| `POST /programme/Read_CruiseApplicationGEOJson` (empty body) | Array of 1,724 GeoJSON FeatureCollections, one per cruise application, keyed by `CruiseApplication_id` | `raw/Read_CruiseApplicationGEOJson.json` (19.6 MB) |
| `GET /programme/timeline` | inline `var ships = […]` — 16 operator orgs + **21 vessels** with ICES, MMSI, last AIS position | `raw/vessels.json` |
| `GET /Programme/Cruise/{VoyageEvent_id or Cruise_id}?organisation_id={org}` | HTML detail pane = the cruise's SME form (science party size, equipment, moorings, grant #, discipline, ports, dates) | `raw/Programme_Cruise_3522.html`, `…_3023.html` |
| `POST /programme/read_shiptrack` | `[]` anonymously | `raw/read_shiptrack.json` |
| `/programme/backend?…` (DayPilot scheduler) | needs the DayPilot request envelope; not pursued — gridtimeline has the same events | `probes/backend-*.body` |

Date filter format is `yyyy-MM-ddT00:00:00.000Z` (from `mse.formatFormDateValue`); plain
`YYYY-MM-DD` also works. Filtering is by *overlap* with scheduled cruise dates. `RC` is a
`|`-joined list of resource-container (operator) ids from `timeline.resourceContainers`.
Without params you get everything (6 MB).

### Vessels covered (21)
Atlantic Explorer (BIOS), Atlantis, Neil Armstrong (WHOI), Blue Heron (UMN), Endeavor,
Narragansett Dawn (URI), F.G. Walton Smith (UMIAMI), Hugh R. Sharp (UDel), Kilo Moana (UH),
Marcus G. Langseth (LDEO), Pelican (LUMCON), Rachel Carson, Thomas G. Thompson (UW), Robert Gordon
Sproul, Roger Revelle, Sally Ride (SIO), Ronald H. Brown (UNOLS/NOAA), Savannah (SkIO), Sikuliaq
(UAF), Taani (OSU/RCRV), USCGC Healy (USCG). Oceanus, L.M. Gould and N.B. Palmer appear on old cruises
only. 18 of 21 have ICES codes + MMSI (Narragansett Dawn, Taani, and Oceanus lack ICES).

### Cruise record fields (decoded gridtimeline record) and how populated (n = 1,724)

| Field | Populated | Notes |
|---|---|---|
| `CruiseApplication_id`, `Workflow_id`, `Cruise_id`, `Cruise.VoyageEvent_id` | 100% | ids; `Workflow.ReferenceNumber` e.g. `26/6947` |
| `Workflow.AlternateReferenceNumber` | 69% | operator cruise code e.g. `AR84-03`, `RR2506` |
| `Name` / `ShortName` | 100% / 96% | project title |
| `VoyageEventTypeName` | 100% | At Sea for Science 1433, Science 171, Transit 59, Passage 48, Charter/Barter/Inspection/Outreach ≤4 |
| `Cruise.Start/End.{Departure, Arrival, MobilisationDate, DemobilisationDate}` | 100% | **scheduled** sail/dock dates (US `M/D/YYYY` strings) |
| `Cruise.Start/End.ActualDeparture/ActualArrival` | 85% | populated once sailed |
| `Legs[]` {Departure, Arrival ISO, DepartName, Name, UN/LOCODE country+location} | 100%; 1–5 legs (88% single-leg); 96% of legs have LOCODE at both ends | **ports per leg** |
| `Mobilisation` / `Demobilisation` {Country, Provence, Location, LOCODE, Lat, Lon} | 97% | port coordinates |
| `Cruise.Start.ArrivalLocation/DepartureLocation` | 96% | same LOCODE object |
| `ScienceLocationGeneral` | 96% | free text ("Washington State continental shelf, ~5-30 nm offshore") |
| GeoJSON (via `Read_CruiseApplicationGEOJson`) | 100% have an entry; Sampling Station 1042, ShipTransect 902, BoundCoordinates 426, Research Area 329, Mooring 203, Port 194, Waypoint 173 | **operating area / track** |
| `Ships[]` | 96% (85% one ship, some list up to 10 = unscheduled preference lists) | `FlexLocation_id` + Name |
| `PrincipleScientist`, `AffiliatedOrganisation` | 100% | name + org abbreviation |
| `Users[]` {Role PI/CS, Name, Organisation, Person_id} | 100% (PI always; Chief Scientist on 33%) | no emails |
| `DestinationFundings[]` {Abbreviation, Name, Days, StatusDisplay} | 99% | NSF/OCE 893, INST 276, NAVY 157, NOAA 143, OTHER 144, NSF/OOI 53 …; status Funded 1703 / Pending 67 / Withdrawn 15 / Declined 7 |
| `Funding` / `Fundings[]` {Division_id, Program_id, PeerReviewed, Confirmed} | 96% | ids only; grant number is in the detail pane |
| `StartDate` / `EndDate` / `LatestEndDate` | 96% | **requested** science-window, *not* the sail date |
| `PreferredDuration`, `MobilisationDays`, `DemobilisationDays` | 95 / 56 / 46% | days |
| `EquipmentTypes[]` / `GenericEquipment[]` / `Equipment[]` | 74 / 25 / 7% | ids only |
| `MetaInformation`, `InPortEvent`, `DateRanges`, `ResearchStream`, `PlanTypeData`, `MinimiumDuration` | 0% | always empty |
| **Berths / science-party size** | — | not in the record. Detail pane has "Total Science Party Size", "Number of science teams", "Operator technicians needed" as requested by the PI. |
| **Status** | partial | funding status only; no explicit "confirmed/tentative/cancelled" flag. `VoyageEventTypeName` + `ActualDeparture` are the proxies. |

Coverage: `StartDate` 2021-01-01 → 2030-05-15. **148 records have a leg departing after
2026-09-17** (94 in late 2026, 45 in 2027, 19 in 2028, 5 in 2029, 1 in 2030); all 148 have some
geometry and 104 have a transect/waypoint track. So yes — future/scheduled cruises are included,
not just past ones, and the fetch-by-date-range and fetch-by-operator filters work.

## 3. Gaps vs. "upcoming cruises on a map with berth availability"

| Need | Status |
|---|---|
| Upcoming cruises, vessel, dates, ports w/ coordinates | ✅ public data |
| Operating area / track for the map | ✅ GeoJSON per cruise (sampling stations, transects, bounds); ~30% of future cruises have only a point/area, no track |
| PI + institution, funding agency | ✅ |
| Science party size | ⚠️ only the *requested* number, only in the per-cruise HTML pane (one call per cruise) |
| Vessel berth capacity | ❌ not in MFP; must live in our `vessels` table (we have `scientists` column already) |
| Berths available | ❌ derived: `berths − requested science party − operator techs`, clearly labelled as estimate; real vacancies need the operator |
| Chief scientist / participant emails | ❌ public; documented Participants API (keyed) has them |
| Cruise status (confirmed / tentative / cancelled) | ⚠️ inferred; the keyed "Combined" API has `ChangesHistory` |
| Gear / equipment | ⚠️ ids only in the record; human-readable in the detail pane |
| Stable public API contract | ❌ for the UI endpoints; ✅ for the keyed API |

For the larger cruise-scheduling feature (operators plan legs/ports/dates/area/science party/gear in
VesselConnect, published alongside ARF schedules; researchers request vacant berths): MFP's record
shape is a good template for our own `cruise_plans` — legs with LOCODE ports, GeoJSON area,
science-party count, equipment. The one thing MFP doesn't model that we need is **berth capacity and
berth requests**, which is exactly the value VesselConnect adds.

## 4. Recommended sync approach

1. **Source of truth:** the keyed `/API/v1/grid.474423.2/schedule/{year}/{ship}` once we have a key
   (21 ships × 2–3 years ≈ 60 small calls). Until then, the public `gridtimeline` +
   `Read_CruiseApplicationGEOJson` endpoints, with the parser isolated so it can be swapped.
2. **Cadence:** UNOLS schedules move on the scale of weeks; a **daily** GitHub Actions job (same
   pattern as `gfw-sync.yml`) is plenty. Fetch `gridtimeline?StartDate=<today−30d>&EndDate=<today+3y>`
   (~300 KB) and the GeoJSON only for ids whose record changed. Never poll more than hourly;
   the documented API documents `429` with backoff.
3. **Dedupe key:** `CruiseApplication_id` (public UI) — it is the join key to the GeoJSON and is
   1:1 with `Workflow_id`. For the keyed API the equivalent is `Event_id`; store both in an
   `external_ref` `{source:'mfp', cruise_application_id, workflow_id, event_id}` so a future switch
   doesn't re-create rows. One MFP record = one cruise with N legs; upsert legs by
   `Legs[].Destination_id`.
4. **Change detection:** hash the decoded record (minus `PrincipleScientist_ModifiedDate` noise);
   mark rows missing from the feed for >2 runs as `withdrawn` rather than deleting.
5. **Vessel join:** by ICES code (`raw/vessels.json`) → add an `ices_code` column on `vessels`; fall
   back to MMSI (we have GFW MMSIs) then name.
6. **Ask for the key anyway** — it gives PI/chief-scientist contacts and `ChangesHistory`, and it's a
   supported contract; the UI endpoints could change without notice.

## Equipment (added 2026-09-23)

- `EquipmentTypes[]` / `GenericEquipment[]` ids in the schedule table have **no public id→name lookup**
  (filter tree, SME pane and inventory page all print names only). `Equipment[]` ids resolve to 0 rows in
  the public inventory — different id space. Don't try to join on them.
- **Gear names per cruise come from the SME detail pane** (`/Programme/Cruise/{VoyageEvent_id}?organisation_id=`):
  "Ship Fitted Equipment" checked list, "Pooled and Portable Equipment", "User Supplied Equipment",
  science-van count. One fetch per cruise.
- `GET /framework/public/read_publicequipmentinventory` → **U.S. ARF equipment inventory**, 1,013 items:
  `Equipment_id, Institution, Name, Type, ModelNumber, Manufacturer, Group, PooledEquipment, BaseLocation`
  (base location is usually `Ship -> <name>`). Vessel-page material ("what's aboard"), not cruise data.
  Saved as `raw/public_equipment_inventory.json`. Also `/framework/public/platforms` (HTML, public).

## Files

- `unols-mfp-guide.html`, `unols-vessel-schedules.html`, `mfp-home.html` — starting pages
- `confluence-mfp-public-apis.*` — API index page; `docs/` — the 8 API pages (json / storage.html / txt / sample code blocks)
- `site/` — `/programme`, `/about`, `robots.txt`, `equipmentinventory`, and the four JS bundles the endpoints were found in
- `probes/` — documented-API probes (`schedule-nokey.*`, `schedule-badkey.*`), DayPilot backend attempts, filter tests, view HTML (`view-*.html`, up to 20 MB)
- `raw/` — the usable data: `gridtimeline.data.json`, `cruises-decoded.json`, `Read_CruiseApplicationGEOJson.json`, `vessels.json`, two cruise detail panes

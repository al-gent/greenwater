# Automated Vessel Matching — Future Project

**Status:** concept only, 2026-08-11. Nothing built. This doc captures the idea and the domain
knowledge behind it so it can be picked up later.

## The problem

A researcher knows their science. They do not know vessel logistics.

They can tell you: *"I need 14 CTD casts to 2,000 m across these 9 stations, plus two sediment
cores, over roughly six days in October, with four people in my field team."*

They cannot tell you that this implies a winch with enough wire, an A-frame rated for the load,
reliable station-keeping while the wire is out, deck space to stage a corer, a wet lab with power,
berths for four scientists on top of crew, and endurance to stay out six days without a port call.

VesselConnect currently asks them the second question. The browse and filter UI is organized
around vessel attributes — length, speed, berths, year built — which is the *operator's*
vocabulary. A scientist arriving from a Google search for "charter a research vessel" has to
already know what to filter for.

The operator's own framing of this, from the source article below: *"The right charter
conversation starts with a clear description of what the science requires — not with a vessel
spec sheet."*

## The idea

A guided path that takes research goals as input and produces operational requirements as output,
then uses those requirements to shortlist vessels.

Two deliverables from one intake:

1. **For the researcher** — a filtered shortlist of vessels that can actually do the job, with the
   reasoning shown ("these three have the winch and berths; these two are ruled out on endurance").
2. **For the operator** — a structured requirements brief attached to the inquiry, instead of
   "I'm interested in your vessel." Operators cannot quote against a vague inquiry; this makes
   the inbound actionable.

The second half may matter as much as the first. It is a supply-side fix disguised as a
demand-side feature.

## Why this is the right shape for the product

- It is the thing an experienced charter broker does, encoded. That is the difference between a
  marketplace and a directory.
- It makes a far better ad landing page than a raw vessel list — relevant to
  `GOOGLE_ADS_PLAN.md`, where `/vessels` is currently the destination for
  "charter a research vessel."
- It creates a natural, high-intent conversion point.

## The data situation — better than it looks

**Correction to an earlier assumption in this doc: the schema already carries most of the
matching fields.** `scripts/schema.sql` has, among others:

| Requirement | Existing column(s) |
|---|---|
| Winches | `OC_winches`, `Winch_other` |
| Cranes / gantries | `Crane_load`, `Crane_outboard_ext`, `Crane_abovedeck`, `Crane_pos`, `Gantry_abovedeck` |
| Station-keeping | `dpos` (DP class), `DP_Equip` |
| CTD capability | `CTD_cap`, `CTD_make`, `CTD_rosette`, `CTD_oxy`, `CTD_trans`, `CTD_fluor`, `CTD_towed` |
| Survey acoustics | `Aquis_Multibeam`, `Acoustic_sonar` |
| Workspace | `Area_wetlab`, `Area_drylab`, `Free_deck_area`, `Freeboard_deck`, `Space_cont_lab` |
| People | `scientists`, `crew`, `officers` |
| Time / area | `endurance`, operating area geojson |
| Class | `Vessel_class`, `ice_breaking` |

So this is not a schema problem. **The open question is fill rate** — how many of the 567 vessels
actually have these populated. That number decides whether matching is useful today or needs
enrichment first, and it should be the first thing measured when this project starts. (Do it as a
SQL aggregate, not by pulling rows into JS.)

### Automated enrichment

Much of the missing detail is published on operator websites, and agents can retrieve it
reliably. Plan for an enrichment pass that crawls operator sites and fills gaps — following the
established rule that enrichment **fills empty fields only** and surfaces discrepancies rather
than overwriting team-set values.

Enrichment can run *after* v0 ships. It does not block the intake flow or the requirements brief.

## Requirement categories to capture

Drawn from the source article, to be refined with a domain expert:

**Science operations** — instruments deployed and how (CTD casts, coring, trawls, moorings, ROV);
over-the-side handling needs; A-frame vs. crane; winch and wire capacity; station-keeping or
dynamic positioning; multibeam / side-scan / sub-bottom profiler integration.

**Workspace** — wet lab, dry lab, deck working area, electrical power for instruments, staging
space for equipment.

**People and time** — field team size (berths on top of crew), days at sea, endurance between
port calls, day/nearshore vs. multi-day offshore.

**Area and season** — operating area, port access, equipment staging, weather window.

**Compliance** — this is where funding agencies are unforgiving, and it is a hard filter rather
than a preference. NOAA / USGS / NSF / ONR / BOEM contracts can require USCG documentation
appropriate to the operating area and vessel class, ABS classification, specific crew licensing
and safety training, a documented Safety Management System, and insurance meeting federal
minimums. UNOLS is the standard-setting reference for academic oceanographic programs.

**Crew** — licensed masters/mates with experience in the operating area *and* with scientific
operations specifically (positioning for deployment, deck management around science gear), which
is not the same as general vessel competence.

**Timing** — spring and early summer are peak. Starting a charter conversation in March for a
May deployment carries real schedule risk; good vessels commit months ahead. Academic calendars,
grant timelines, and funding cycles make this harder than commercial booking.

## Evaluation — this problem has a real loss function

Unusually for a recommendation feature, correctness here is checkable. The question *"were the
vessels we recommended actually capable of conducting this research?"* has a ground-truth answer,
and the vessels are already in our database.

That gives a straightforward evaluation loop:

1. Assemble a set of realistic research briefs (real past cruises are ideal).
2. Run the matcher; capture its shortlist and its stated reasoning.
3. Have a domain expert label each recommendation capable / not capable, with the reason.
4. Score both directions — vessels wrongly recommended (false positives, the costly error) and
   capable vessels wrongly excluded (false negatives).

**Lisa is likely the better labeller than Mark** — same domain competence, and she is not the
board chair who has been requesting the feature, which keeps the evaluation independent of the
person advocating for it. Mark is the right source for encoding the rules; Lisa is the better
source for grading their output.

False positives matter far more than false negatives: recommending a vessel that cannot do the
job burns credibility with both the researcher and the operator. Tune conservative.

## Provenance

Mark has been asking for this feature since Adam was hired — it is the longest-standing product
request on the board's wish list, which is worth knowing both as validation and as a reason to
justify the design on its own merits rather than on who asked for it.

## Open questions

- How much of the requirements → specs translation can be rules, and how much needs a human?
- Who encodes the expertise? Mark (NOAA ret., runs a research vessel operation) is the obvious
  source and this is an interview-and-encode project as much as an engineering one.
- Scope guard: full voyage planning is enormous. MVP is guided intake → shortlist +
  structured brief. Not schedules, not quotes, not permits.
- What is the actual fill rate on the capability columns above? First thing to measure.
- Tone and liability: the output must read as advisory, not as certification that a vessel is fit
  or compliant for a given mission. Compliance fields especially should point to what to verify
  with the operator, never assert it.

## Source material

- [Chartering a Research Vessel for Academic and Scientific Programs](https://gmsoffshore.com/chartering-a-research-vessel-for-academic-and-scientific-programs-what-institutions-need-to-know/)
  — GMS Offshore. **Note the source:** this is a vessel operator's own marketing content, and it
  is regionally specific (New England through the Mid-Atlantic). Its emphases — peak season
  timing, UNOLS, US federal funding agencies — reflect that market. Treat it as high-quality
  domain expertise about *what questions matter*, not as a neutral or global reference. It says
  nothing about cost structure, which is a gap worth filling from another source.

# Google Ad Grants — Launch Plan

**Status:** grant activated 2026-08-10. Nothing is running yet.

| | |
|---|---|
| Program | Google Ad Grants (nonprofit) — $10,000/mo, ~$329/day, **Search only** |
| Customer ID | 269-208-9178 |
| Organization | Greenwater Foundation, Charity ID 92-1506279 |
| Account admin | 94gent@gmail.com |
| Target audience | Both sides in parallel — scientists seeking vessels, operators seeking listings |

---

## 0. Account setup — COMPLETE 2026-08-11

Verified in the account: Ads invite accepted, account reads **Active**, and the *Updated Terms
and Conditions* banner (which was blocking serving and locking navigation to Preferences) has
been accepted. Google for Nonprofits shows Ad Grants **Approved**, CID 269-208-9178.

Workspace for Nonprofits is still **"Activation request received"** — pending, unrelated to ads.

If Google Ads ever asks for payment details inside CID 269-208-9178, stop — that means you're in the wrong account.

---

## 1. Domain approval — SUBMITTED 2026-08-11

**Status: filed.** Submitted via the official Ad Grants *Request an additional domain* form at
`support.google.com/grants/contact/grants_v` (redirects to the Google for Nonprofits help form).
Confirmation: *"Your email has been sent to Google Ads Support."* The form states review takes up
to 7 business days; the confirmation page says a reply typically comes within one business day.
Watch 94gent@gmail.com. **Do not point ads at vesselconnect.org until approval arrives** —
using an unapproved domain can trigger suspension.

Submitted values: contact Adam Gent / 94gent@gmail.com · CID 269-208-9178 · account status
"active and not deactivated" · additional domain `vesselconnect.org` · deleting domains: No.

Note: the form asks only for **root** domains — subdomains and subdirectories are automatically
covered once the root is approved.

### Background (why this was needed)

Ad Grants ads may only land on the domain approved in the application, which is almost certainly `greenwaterfoundation.org`. The product lives on `vesselconnect.org`.

`vessels.greenwaterfoundation.org` is **not** a usable workaround: it currently returns a 308 redirect to `vesselconnect.org`, and a final URL that redirects to a different domain violates both Ads destination policy and the Grants one-domain rule.

**Action:** request that `vesselconnect.org` be added as an approved domain on the grant account. Ownership is already provable — it's verified in Search Console under the same `94gent@gmail.com`.

### Draft support request

> Hello,
>
> We are Greenwater Foundation (Charity ID 92-1506279), Ad Grants account 269-208-9178, activated 10 August 2026.
>
> We would like to add a second domain to our account: **vesselconnect.org**.
>
> Greenwater Foundation owns and operates this domain. It hosts VesselConnect, our free nonprofit platform connecting marine scientists with research vessels worldwide — the core program our advertising will support. The domain is verified to this same Google account in Search Console, is served entirely over HTTPS, carries no third-party advertising, sells nothing, and is operated by the foundation rather than by any third party. Our organizational site, greenwaterfoundation.org, links to it directly.
>
> Please let us know if you need any further verification of ownership.
>
> Thank you,
> Adam Gent, Greenwater Foundation

Submit via Google for Nonprofits support / the Ad Grants help center contact form. Turnaround is typically a few business days. **Do not launch campaigns pointing at vesselconnect.org until this is confirmed.**

---

## 2. Conversion tracking

Ad Grants requires meaningful conversion tracking and at least one recorded conversion per month. The site's Vercel Analytics and internal `PageViewTracker` are invisible to Google, so this is new plumbing.

**Code: done.** `lib/gtag.ts` + `components/GoogleAdsTag.tsx`, wired into `app/layout.tsx` and fired at four points:

| Event | Fires at | Ads conversion category | Priority |
|---|---|---|---|
| `signup` | `app/auth/signup/page.tsx` — successful `signUp()` | Sign-up | **Primary** |
| `inquiry` | `components/RequestModal.tsx` — message POST succeeds | Submit lead form | **Primary** |
| `listing` | `app/list-your-vessel/apply/ApplyForm.tsx` — submission succeeds | Submit lead form | Secondary |
| `newsletter` | `components/NewsletterForm.tsx` — subscribe succeeds | Subscribe | Secondary |

Everything is env-driven, so no code change is needed when labels are minted or a conversion action is recreated. With `NEXT_PUBLIC_GOOGLE_ADS_ID` unset, the tag never loads and every call is a no-op — local dev and previews stay clean.

### Conversion actions — CREATED 2026-08-12

Four actions created in Ads (Goals → Conversions, "Add manually using code"), all Website source, Count = One. The auto-created "Sign-up" action from the campaign wizard's goal step (inert — no tag, no webpage rules, but a second Primary that flagged the goal "Misconfigured") was **removed**; our tagged action is named **`Sign-up (1)`** and is the goal's only Primary.

| Action | Label (`send_to` = `AW-18381800233/<label>`) | Optimization |
|---|---|---|
| Sign-up (1) | `XzuaCMDXwuAcEKmGkL1E` | Primary (Sign-up goal) |
| Newsletter subscribe | `XTlpCISY0-AcEKmGkL1E` | Secondary (Sign-up goal) |
| Vessel inquiry | `Fvh7CIeY0-AcEKmGkL1E` | Primary (Submit lead form goal — not a campaign goal, so it never inflates the campaign Conversions column) |
| Listing application | `Crm4CIqY0-AcEKmGkL1E` | Primary (Submit lead form goal, same note) |

Vercel env values (all environments):
```
NEXT_PUBLIC_GOOGLE_ADS_ID=AW-18381800233
NEXT_PUBLIC_GADS_LABEL_SIGNUP=XzuaCMDXwuAcEKmGkL1E
NEXT_PUBLIC_GADS_LABEL_INQUIRY=Fvh7CIeY0-AcEKmGkL1E
NEXT_PUBLIC_GADS_LABEL_LISTING=Crm4CIqY0-AcEKmGkL1E
NEXT_PUBLIC_GADS_LABEL_NEWSLETTER=XTlpCISY0-AcEKmGkL1E
```

Remaining: set the env vars, **redeploy** (`NEXT_PUBLIC_*` is inlined at build), then verify with a real signup — conversions can take ~3 h to appear in Ads. Actions show "Inactive" until the first hit; that also clears the "Misconfigured" goal status.

Two caveats worth knowing:

- `signup` fires when the form is submitted, **before** the email confirmation link is clicked. It will modestly overcount versus confirmed accounts.
- `inquiry` requires an account *and* team review of researcher accounts before messaging is possible, so almost no ad click will reach it same-session. Treat **signup as the real optimization target**; inquiry is the quality check behind it.

---

## 3. Campaign structure

Four campaigns at launch — both sides of the marketplace in parallel (see Campaign D for why this changed). Each campaign's daily budget set to **$329** (the account is capped account-wide; per-campaign caps only throttle you).

Settings for every campaign: Search Network only, **no** search partners, **no** Display expansion. Location option set to **"Presence: people in or regularly in your targeted locations"** — not "presence or interest," which is a major source of junk clicks.

### Campaign A — Brand
Cheap, near-100% CTR, and it props up the account-wide CTR average that keeps the grant alive.

- Ad group *VesselConnect*: `[vesselconnect]`, `[vessel connect]`, `"vesselconnect research vessels"`
- Ad group *Greenwater*: `[greenwater foundation]`, `"greenwater marine sciences"`

Single-word keywords are normally banned; **your own brand name is an explicit exception**.

### Campaign B — Charter a research vessel (highest intent)

- Ad group *Research vessel charter*: `"research vessel charter"`, `[charter a research vessel]`, `"charter research ship"`, `"research vessel for hire"`
- Ad group *Oceanographic ship hire*: `"oceanographic vessel charter"`, `"oceanographic research ship for hire"`, `"marine research vessel rental"`
- Ad group *Survey & fieldwork vessels*: `"survey vessel charter"`, `"vessel for marine fieldwork"`, `"boat for oceanographic survey"`

Landing page: `/vessels`

### Campaign C — Find / browse vessels (discovery)

- Ad group *Vessel directory*: `"research vessel database"`, `"research vessel directory"`, `"list of research vessels"`
- Ad group *By region*: `"research vessels by country"`, `"research vessels near me"`, `"research vessel fleet map"`

Landing page: `/vessels` and `/map`

**Match types: phrase and exact only at launch.** Broad match is the single most common way Grant accounts fall under the 5% CTR floor and get suspended. Revisit after 60 days of stable CTR.

### Campaign D — List your vessel (operators)

**Decision changed 2026-08-11: launch this in parallel with the scientist campaigns, not in a later phase.** The original plan held it back to avoid splitting attention, but the operator keywords are just as specific as the scientist ones — `"list my research vessel"` is no more likely to pull junk traffic than `"research vessel charter"`. Since nobody knows yet whether supply or demand converts better, running both is how we find out, and the CTR risk that motivated the delay comes from *loose* keywords rather than from *more* campaigns.

- Ad group *List a vessel*: `"list my research vessel"`, `"add my vessel to a research directory"`, `"register research vessel"`
- Ad group *Charter to scientists*: `"charter my vessel to researchers"`, `"research vessel marketplace"`, `"find charters for my boat"`

Landing page: `/list-your-vessel`

This also serves Meg's ask for more small/medium listings directly.

**Watch item:** with four campaigns instead of three, the account-wide CTR average is spread across more surface. If operator CTR runs materially below the scientist side after a few weeks, pause it rather than letting it drag the account toward the 5% floor — the two audiences share one CTR number.

---

## 4. Ad copy

Two responsive search ads per ad group (a policy requirement). Draft below for Campaign B — vary the emphasis for the second ad rather than reshuffling the same lines.

**Headlines** (30 char max — verify in the editor, and confirm the vessel count against the live database before using a number):

```
Charter a Research Vessel
Find a Research Vessel
Research Vessel Directory
Ships for Ocean Research
Search Vessels by Region
Compare Vessel Specs
Message Operators Direct
Free for Marine Scientists
Nonprofit Vessel Registry
By Greenwater Foundation
Plan Your Next Expedition
Vessels for Fieldwork
Oceanographic Ship Search
Global Research Fleet
No Broker, No Commission
```

**Descriptions** (90 char max):

```
Browse research vessels worldwide. Filter by region, size, berths, and capability.
Message vessel operators directly. Free, nonprofit-run, built for marine scientists.
Find the right ship for your survey, cruise, or fieldwork — no broker, no commission.
See specs, home ports, and recent port calls before you reach out to an operator.
```

Pin nothing at first; let Google test combinations, then pin headline 1 if a weak combination emerges.

**Sitelinks** (≥2 required account-wide — all must stay on the approved domain, so do **not** link the greenwaterfoundation.org "About" page unless both domains are approved):

| Sitelink | URL | Description |
|---|---|---|
| Browse All Vessels | `/vessels` | Search the full registry by region, size, and capability |
| Vessel Map | `/map` | See research vessels and recent port calls worldwide |
| List Your Vessel | `/list-your-vessel` | Operators: add your vessel to the registry, free |
| Create an Account | `/auth/signup` | Free account for scientists — message operators directly |

---

## 5. Geo targeting

Two tiers, run as separate campaigns *or* separate ad groups with location bid adjustments so the reporting stays legible:

- **Core research markets:** United States, Canada, United Kingdom, Australia, New Zealand, Norway, Germany, Netherlands, France, Spain, Portugal
- **Eastern tropical Pacific:** Ecuador, Peru, Chile, Colombia — the same audience as the researcher outreach campaign, which makes paid search a useful read on whether that region responds at all

---

## 6. Compliance guardrails

These are the conditions that get Grant accounts deactivated. Worth a monthly check:

- **5% account-wide CTR** — two consecutive months below it deactivates the account. This is the main risk here, and the reason for exact/phrase match and a brand campaign.
- **Keyword quality score ≥ 3** — pause or remove anything at 1–2.
- **No single-word keywords** (brand names excepted) and no overly generic terms.
- **≥2 ad groups per campaign, ≥2 ads per ad group, ≥2 sitelinks.**
- **Geo targeting must be set** on every campaign.
- **≥1 conversion per month**, with working conversion tracking.
- **Log in at least monthly; make a change at least every 90 days.**
- **Answer the annual program survey** or the grant lapses.

Negative keywords to load before launch:

```
jobs, careers, salary, hiring, internship, vacancy, crewing
for sale, buy, price of, used boat
navy, coast guard, military
model, rc, toy, lego
wallpaper, images, photos, wikipedia
cruise ship, cruise deals, yacht charter, fishing charter
```

`yacht charter` and `fishing charter` matter — they're high-volume commercial terms that would drain impressions with near-zero CTR.

---

## 7. Realistic expectations

You will not spend $10,000/month, and that is fine. "Research vessel charter" is a niche of a few hundred searches a month globally; realistic spend is **$200–800/month**. Combined with the $2 CPC cap, competitive commercial auctions are simply out of reach — but the terms that matter here are cheap and uncontested.

The grant's value is qualified traffic plus, via conversion data, the first real evidence of which framing brings scientists in — which is directly the "documented success stories" question Meg raised on 8/3.

**Escaping the $2 cap:** switch to Maximize Conversions bidding, which is exempt. It needs roughly 15 conversions/month to behave sensibly, so stay on manual CPC at $2 until the data supports it.

---

## 8. Sequence

| When | Step |
|---|---|
| ~~Now~~ | ~~Confirm account setup; submit the vesselconnect.org domain request~~ — both done 2026-08-11 |
| ~~Now~~ | ~~Build Campaign B~~ — **PUBLISHED PAUSED 2026-08-11** as `researcher-campaign`: Clicks bidding + $2.00 cap, 15 countries, Presence-only, networks off, AI Max off, EU-political-ads No, ad group *Research vessel charter* (4 keywords, 1 RSA — 8 headlines/4 descriptions, 93.7% quality), 4 sitelinks, $329/day. Wizard quirks hit: identity-check wall mid-flow (blocks saving until confirmed — watch for stale "failed to save"/review states), one-ad-group-per-wizard limit, DRAFT_SYNCHRONOUS_PROMOTE error on publish that actually succeeded. |
| ~~Next~~ | ~~Rename ad group 1; add ad groups 2-3; negative list~~ — **DONE 2026-08-11 (evening).** All three ad groups live in `researcher-campaign` with our keywords + 1 RSA each ("Pending / ads under review"); "Global negatives" shared list (24 terms) created and attached at campaign level. **Editor gotcha learned:** the new-ad-group flow prefills keywords (broad-match junk like "vessel number lookup") AND a full RSA scraped from the web (it quoted another operator's catamaran) — always wipe the keywords box and hit **Clear prefills** on the ad before entering copy; Clear prefills keeps hand-typed fields. Watch for phantom "Value is required" on filled headline fields — clear + retype fixes. |
| ~~Next, in editor~~ | ~~2nd RSA per ad group~~ — **DONE 2026-08-12**, all 3 ad groups have 2 RSAs (6/6, pending review). Campaigns A (Brand), C (Discovery), D (Operators) still to build — attach "Global negatives" to each. |
| ~~On domain approval~~ | **Domain APPROVED 2026-08-12.** Four conversion actions created same day (IDs in §2); auto-created duplicate "Sign-up" action removed. Remaining: env vars → redeploy → test signup → enable. |
| Before building | Run the proposed keywords as real Google searches and record what comes back — who else is advertising, whether results are commercial charter brokers or science orgs, and whether the intent behind each phrase is what we assumed. Cheap, and it kills bad keywords before they cost CTR. |
| After launch | Tell the team what shipped and invite comment — deliberately not a pre-approval gate. |
| +1 day | Build campaigns A/B/C/D, load negatives, write ads, add sitelinks — leave paused |
| +2 days | Confirm a test conversion recorded, then enable |
| Weekly, first month | Check search terms report, add negatives, watch CTR against 5% |
| +30 days | Review conversions; consider Maximize Conversions bidding |

---

## 9. Build sheet — Campaign B (demand side), screen by screen

Google reshuffles this UI constantly, so labels may sit in a different order than below. The
decisions are what matter, not the sequence.

**First, once per account:** Tools → Shared library → **Negative keyword lists** → create
"Global negatives" from the §6 list and apply it to every campaign. Doing this at account level
means you maintain one list instead of four.

### Creating the campaign

1. **Campaigns → + New campaign.**
2. **Objective.** Choose **"Create a campaign without a goal's guidance."** *Leads* is the
   conceptually correct objective — signups and vessel inquiries are lead-gen conversions, not
   sales or raw traffic — and picking it does no harm. But the objective only presets defaults
   and adds nudges; it unlocks nothing. Going without goal guidance gives the same capabilities
   with fewer prompts steering toward things Ad Grants forbids.
3. **Campaign type: Search.** Not Performance Max, not Demand Gen, not Display. Ad Grants is
   search-only and Performance Max is ineligible.
4. If asked **"ways you'd like to reach your goal"** — skip it. No phone-call goals, no lead
   forms; conversions are already tracked on-site.
5. **Campaign name:** `Demand — Charter a research vessel`.

### Bidding — the screen where it's easiest to go wrong

6. It will default to focusing on **Conversions** with *Maximize conversions*. Click the small
   **"Or, select a bid strategy directly"** link and choose **Manual CPC**. Uncheck *Enhanced CPC*
   if offered.
   - Why: the $2 Ad Grants cap is a manual-bidding cap, and smart bidding needs conversion
     history the account does not have yet. Revisit at ~15 conversions/month.
7. Set **Max CPC $2.00** at the ad group level once ad groups exist.

### Campaign settings

8. **Networks:** uncheck **Search partners** and uncheck **Display Network**. Both are on by
   default; both are off-limits.
9. **Locations:** add the core markets and the ETP tier from §5. Then open the collapsed
   **Location options** and select **"Presence: People in or regularly in your targeted
   locations."** The default is *presence or interest*, which serves ads to people merely
   reading about Peru. This setting is buried and costs real money if missed.
10. **Languages:** English only until Spanish ad copy exists and has had a native review.
11. **Audience segments:** skip. **Automatically created assets / broad match suggestions:** off.

### Ad groups, keywords, ads

12. Create three ad groups, each with its §3 keywords, typed with punctuation that sets match
    type: `"quoted"` = phrase, `[bracketed]` = exact. Unpunctuated = broad — never leave it that
    way, and delete the broad-match keywords Google suggests alongside yours.
    - `Research vessel charter`
    - `Oceanographic ship hire`
    - `Survey & fieldwork vessels`
13. **Two responsive search ads per ad group** (policy minimum). Final URL
    `https://vesselconnect.org/vessels`. Headlines and descriptions from §4 — paste more than the
    minimum and let Google test combinations.
14. **Sitelinks:** add all four from §4. Two is the policy minimum.

### Budget and launch

15. **Budget $329/day.** Google may warn that this is unusually high — ignore it; the grant caps
    real spend and you will not come near this.
16. **Publish the campaign paused.** Do not enable until (a) the vesselconnect.org domain approval
    email has arrived and (b) a test conversion has been confirmed in the Ads UI.

### Post-build compliance check

Confirm before enabling: ≥2 ad groups ✓ (3), ≥2 ads per ad group, ≥2 sitelinks, geo targeting set,
no single-word or broad keywords, conversion tracking live.

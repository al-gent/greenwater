-- Analytics v2: parameterized RPC with bot/staff filtering, funnel, normalized referrers,
-- and audience segmentation (registered vs anonymous, per-role breakdown).
-- Run once in Supabase SQL Editor.
-- Called via supabaseAdmin.rpc('get_analytics_v2', { p_days_back, p_site_filter, p_exclude_bots, p_exclude_staff, p_segment })

-- Signature changed (p_segment added) — drop the old 4-arg version so PostgREST
-- doesn't see two ambiguous overloads.
DROP FUNCTION IF EXISTS get_analytics_v2(integer, text, boolean, boolean);

CREATE OR REPLACE FUNCTION get_analytics_v2(
  p_days_back     integer DEFAULT 30,
  p_site_filter   text    DEFAULT 'app',   -- 'app' | 'cms' | 'both'
  p_exclude_bots  boolean DEFAULT true,
  p_exclude_staff boolean DEFAULT true,
  p_segment       text    DEFAULT 'all'    -- 'all' | 'registered' | 'anon'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
WITH
  cutoff_ts AS (
    SELECT NOW() - (p_days_back || ' days')::interval AS ts
  ),
  prev_cutoff_ts AS (
    -- Previous period of equal length for % change comparison
    SELECT NOW() - (p_days_back * 2 || ' days')::interval AS ts
  ),

  -- Visitor hashes that touched /admin in this period — used to identify staff.
  -- Note: hashes are daily, so staff are only excluded for days they visited /admin
  -- within the selected time range. Rows with user_role='admin' are excluded
  -- directly (exact), the hash heuristic covers admins' logged-out browsing.
  staff_hashes AS (
    SELECT DISTINCT visitor_hash
    FROM page_views
    WHERE path LIKE '/admin%'
      AND created_at >= (SELECT ts FROM cutoff_ts)
      AND visitor_hash IS NOT NULL
  ),

  -- Core filtered dataset: applies site, bot, staff, and segment filters.
  -- Referrer normalization happens here so GROUP BY downstream gets correct aggregates.
  filtered AS (
    SELECT
      pv.site,
      pv.path,
      pv.visitor_hash,
      pv.created_at,
      pv.country,
      pv.user_role,
      CASE
        WHEN pv.referrer IS NULL           THEN NULL  -- direct
        WHEN pv.referrer ~* '^https?://'   THEN (
          SELECT CASE
            WHEN host LIKE '%facebook.com' OR host LIKE '%fb.com' THEN 'facebook.com'
            -- Both app domains canonicalize to vesselconnect.org so they group as one referrer
            WHEN host = 'vessels.greenwaterfoundation.org'         THEN 'vesselconnect.org'
            -- greenwaterfoundation.org (CMS) intentionally kept separate from the app domains;
            -- CMS→app cross-property traffic is valid acquisition signal.
            ELSE NULLIF(host, '')
          END
          FROM (
            SELECT LOWER(
              COALESCE((regexp_match(pv.referrer, '^https?://(?:www\.)?([^/?#]+)'))[1], '')
            ) AS host
          ) h
        )
        ELSE NULL  -- non-URL referrer (e.g. android-app://) treated as direct
      END AS ref_host
    FROM page_views pv
    WHERE
      pv.created_at >= (SELECT ts FROM cutoff_ts)
      AND (p_site_filter = 'both' OR pv.site = p_site_filter)
      AND (
        NOT p_exclude_bots
        OR pv.user_agent IS NULL
        OR pv.user_agent !~* 'bot|crawl|spider|GoogleOther|headless|Slurp|AhrefsBot|Bytespider|Applebot|SEMrushBot|DataForSeo|PetalBot|YandexBot|DotBot|MJ12bot|archive\.org_bot|facebookexternalhit'
      )
      AND (
        NOT p_exclude_staff
        OR (
          pv.user_role IS DISTINCT FROM 'admin'
          AND (
            pv.visitor_hash IS NULL
            OR pv.visitor_hash NOT IN (SELECT visitor_hash FROM staff_hashes)
          )
        )
      )
      AND (
        p_segment = 'all'
        OR (p_segment = 'registered' AND pv.user_role IS NOT NULL)
        OR (p_segment = 'anon'       AND pv.user_role IS NULL)
      )
  ),

  -- Previous period unique visitors (same filters, for % change card).
  -- Staff filter still uses current-period staff_hashes — acceptable approximation.
  prev_uniques AS (
    SELECT COUNT(DISTINCT pv.visitor_hash)::int AS val
    FROM page_views pv
    WHERE
      pv.created_at >= (SELECT ts FROM prev_cutoff_ts)
      AND pv.created_at <  (SELECT ts FROM cutoff_ts)
      AND (p_site_filter = 'both' OR pv.site = p_site_filter)
      AND (
        NOT p_exclude_bots
        OR pv.user_agent IS NULL
        OR pv.user_agent !~* 'bot|crawl|spider|GoogleOther|headless|Slurp|AhrefsBot|Bytespider|Applebot|SEMrushBot|DataForSeo|PetalBot|YandexBot|DotBot|MJ12bot|archive\.org_bot|facebookexternalhit'
      )
      AND (
        NOT p_exclude_staff
        OR (
          pv.user_role IS DISTINCT FROM 'admin'
          AND (
            pv.visitor_hash IS NULL
            OR pv.visitor_hash NOT IN (SELECT visitor_hash FROM staff_hashes)
          )
        )
      )
      AND (
        p_segment = 'all'
        OR (p_segment = 'registered' AND pv.user_role IS NOT NULL)
        OR (p_segment = 'anon'       AND pv.user_role IS NULL)
      )
  ),

  -- Top-level headline counts
  headlines AS (
    SELECT
      COUNT(DISTINCT visitor_hash)::int                                  AS unique_visitors,
      COUNT(*)::int                                                      AS total_views,
      COUNT(*) FILTER (WHERE path ~ '^/vessels/[0-9]+')::int            AS vessel_views,
      -- listing page renamed /list → /list-your-vessel on 2026-05-27; count both
      COUNT(*) FILTER (WHERE path IN ('/list', '/list-your-vessel'))::int AS list_visits
    FROM filtered
  ),

  -- Signups: new profiles rows in the period (both researcher and operator accounts)
  signups AS (
    SELECT COUNT(*)::int AS val
    FROM profiles
    WHERE created_at >= (SELECT ts FROM cutoff_ts)
  ),

  -- Daily series: every calendar day in the range with zero-fill for days with no visits.
  -- unique_visitors here = COUNT(DISTINCT visitor_hash) per day, respecting all filters.
  -- This is unique daily sessions, not unique people across the period.
  date_series AS (
    SELECT generate_series(
      (CURRENT_DATE - (p_days_back - 1))::timestamp,
      CURRENT_DATE::timestamp,
      '1 day'::interval
    )::date AS day
  ),
  daily AS (
    SELECT
      ds.day::text                         AS date,
      COUNT(DISTINCT f.visitor_hash)::int  AS unique_visitors,
      COUNT(f.*)::int                      AS total_views
    FROM date_series ds
    LEFT JOIN filtered f ON f.created_at::date = ds.day
    GROUP BY ds.day
    ORDER BY ds.day
  ),

  -- Funnel step 4: visitor hashes that viewed 2+ distinct vessel detail pages
  multi_vessel_visitors AS (
    SELECT visitor_hash
    FROM filtered
    WHERE path ~ '^/vessels/[0-9]+'
      AND visitor_hash IS NOT NULL
    GROUP BY visitor_hash
    HAVING COUNT(DISTINCT path) >= 2
  ),

  -- Funnel aggregates (steps 1-4; step 5 = signups, same as above)
  funnel AS (
    SELECT
      COUNT(DISTINCT visitor_hash)::int                                             AS visitors,
      COUNT(DISTINCT visitor_hash) FILTER (WHERE path = '/')::int                  AS homepage,
      COUNT(DISTINCT visitor_hash) FILTER (WHERE path ~ '^/vessels/[0-9]+')::int   AS vessel_click,
      (SELECT COUNT(*)::int FROM multi_vessel_visitors)                             AS multi_vessel
    FROM filtered
  ),

  -- Referrers: normalized, self-referrals excluded, grouped after normalization
  top_referrers AS (
    SELECT
      COALESCE(ref_host, 'Direct')         AS label,
      COUNT(*)::int                        AS views,
      COUNT(DISTINCT visitor_hash)::int    AS unique_visitors
    FROM filtered
    WHERE ref_host IS NULL
       OR (
         ref_host NOT ILIKE '%localhost%'
         AND ref_host NOT ILIKE '%127.0.0.1%'
         -- Site-aware self-referral exclusion:
         -- App viewing: exclude vessels.greenwaterfoundation.org / vesselconnect.org (self), keep greenwaterfoundation.org (CMS→app is valid)
         -- CMS viewing: exclude greenwaterfoundation.org (self), keep vessels.greenwaterfoundation.org (app→CMS is valid)
         AND NOT (p_site_filter IN ('app',  'both') AND ref_host = 'vesselconnect.org')
         AND NOT (p_site_filter IN ('cms',  'both') AND ref_host = 'greenwaterfoundation.org')
       )
    GROUP BY ref_host
    ORDER BY views DESC
    LIMIT 15
  ),

  -- Entry pages: first path recorded per visitor_hash in the period.
  -- DISTINCT ON with ORDER BY visitor_hash, created_at ASC picks the earliest row per visitor.
  entry_page_counts AS (
    SELECT first_path AS entry_page, COUNT(*)::int AS entries
    FROM (
      SELECT DISTINCT ON (visitor_hash) visitor_hash, path AS first_path
      FROM filtered
      WHERE visitor_hash IS NOT NULL
      ORDER BY visitor_hash, created_at ASC
    ) firsts
    GROUP BY first_path
    ORDER BY entries DESC
    LIMIT 10
  ),

  -- Vessel pages: aggregate row + top individual pages
  vessel_agg AS (
    SELECT
      COUNT(*)::int                        AS total_views,
      COUNT(DISTINCT visitor_hash)::int    AS unique_visitors
    FROM filtered
    WHERE path ~ '^/vessels/[0-9]+'
  ),
  top_vessel_pages AS (
    SELECT
      path,
      COUNT(*)::int                        AS views,
      COUNT(DISTINCT visitor_hash)::int    AS unique_visitors
    FROM filtered
    WHERE path ~ '^/vessels/[0-9]+'
    GROUP BY path
    ORDER BY views DESC
    LIMIT 10
  ),
  top_non_vessel_pages AS (
    SELECT
      path,
      COUNT(*)::int                        AS views,
      COUNT(DISTINCT visitor_hash)::int    AS unique_visitors
    FROM filtered
    WHERE path !~ '^/vessels/[0-9]+'
    GROUP BY path
    ORDER BY views DESC
    LIMIT 10
  ),

  -- Referrer breakdown for the listing page (operator acquisition source).
  -- Renamed /list → /list-your-vessel on 2026-05-27; count both for history.
  list_sources AS (
    SELECT
      COALESCE(ref_host, 'Direct') AS label,
      COUNT(*)::int                AS views
    FROM filtered
    WHERE path IN ('/list', '/list-your-vessel')
    GROUP BY ref_host
    ORDER BY views DESC
    LIMIT 8
  ),

  -- Countries (by unique sessions, not raw views)
  top_countries AS (
    SELECT
      COALESCE(country, 'Unknown')         AS label,
      COUNT(DISTINCT visitor_hash)::int    AS unique_visitors
    FROM filtered
    GROUP BY country
    ORDER BY unique_visitors DESC
    LIMIT 15
  ),

  -- Audience: views/uniques per role (anonymous = no session at view time).
  -- user_role only exists on rows written after the segmentation deploy;
  -- older rows count as anonymous.
  role_breakdown AS (
    SELECT
      COALESCE(user_role, 'anonymous')     AS label,
      COUNT(*)::int                        AS views,
      COUNT(DISTINCT visitor_hash)::int    AS unique_visitors
    FROM filtered
    GROUP BY user_role
    ORDER BY views DESC
  )

SELECT json_build_object(
  'headlines', (
    SELECT json_build_object(
      'uniqueVisitors',     h.unique_visitors,
      'prevUniqueVisitors', (SELECT val FROM prev_uniques),
      'totalViews',         h.total_views,
      'vesselViews',        h.vessel_views,
      'listVisits',         h.list_visits,
      'signups',            (SELECT val FROM signups)
    ) FROM headlines h
  ),
  'funnel', (
    SELECT json_build_object(
      'visitors',    f.visitors,
      'homepage',    f.homepage,
      'vesselClick', f.vessel_click,
      'multiVessel', f.multi_vessel,
      'signups',     (SELECT val FROM signups)
    ) FROM funnel f
  ),
  'daily',      (SELECT COALESCE(json_agg(row_to_json(d) ORDER BY d.date), '[]'::json) FROM daily d),
  'referrers',  (SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM top_referrers r),
  'entryPages', (SELECT COALESCE(json_agg(row_to_json(e)), '[]'::json) FROM entry_page_counts e),
  'topPages', json_build_object(
    'vesselTotal', (SELECT row_to_json(va) FROM vessel_agg va),
    'vessels',     (SELECT COALESCE(json_agg(row_to_json(tv)), '[]'::json) FROM top_vessel_pages tv),
    'nonVessel',   (SELECT COALESCE(json_agg(row_to_json(nv)), '[]'::json) FROM top_non_vessel_pages nv)
  ),
  'listSources', (SELECT COALESCE(json_agg(row_to_json(ls)), '[]'::json) FROM list_sources ls),
  'countries',   (SELECT COALESCE(json_agg(row_to_json(co)), '[]'::json) FROM top_countries co),
  'roles',       (SELECT COALESCE(json_agg(row_to_json(rb)), '[]'::json) FROM role_breakdown rb)
)
INTO result;

RETURN result;
END;
$$;

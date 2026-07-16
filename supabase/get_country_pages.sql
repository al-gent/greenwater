-- Country drill-down: top pages viewed by visitors from one country.
-- Run once in Supabase SQL Editor.
-- Called via supabaseAdmin.rpc('get_country_pages', { p_country, p_days_back, p_site_filter, p_exclude_bots, p_exclude_staff, p_segment })
-- p_country is the ISO code stored on page_views ('SG', 'US', …) or 'Unknown' for rows with no country.

CREATE OR REPLACE FUNCTION get_country_pages(
  p_country       text,
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
  staff_hashes AS (
    SELECT DISTINCT visitor_hash
    FROM page_views
    WHERE path LIKE '/admin%'
      AND created_at >= (SELECT ts FROM cutoff_ts)
      AND visitor_hash IS NOT NULL
  ),
  -- Same filter stack as get_analytics_v2, plus the country match.
  filtered AS (
    SELECT pv.path, pv.visitor_hash
    FROM page_views pv
    WHERE
      pv.created_at >= (SELECT ts FROM cutoff_ts)
      AND COALESCE(pv.country, 'Unknown') = p_country
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
  totals AS (
    SELECT
      COUNT(*)::int                     AS total_views,
      COUNT(DISTINCT visitor_hash)::int AS unique_visitors
    FROM filtered
  ),
  top_pages AS (
    SELECT
      path,
      COUNT(*)::int                     AS views,
      COUNT(DISTINCT visitor_hash)::int AS unique_visitors
    FROM filtered
    GROUP BY path
    ORDER BY views DESC
    LIMIT 15
  )

SELECT json_build_object(
  'total', (SELECT row_to_json(t) FROM totals t),
  'pages', (SELECT COALESCE(json_agg(row_to_json(p)), '[]'::json) FROM top_pages p)
)
INTO result;

RETURN result;
END;
$$;

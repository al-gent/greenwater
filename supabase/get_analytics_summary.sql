-- Run once in Supabase SQL Editor to create the analytics aggregate function.
-- Called via supabaseAdmin.rpc('get_analytics_summary', { days_back: 30 })

CREATE OR REPLACE FUNCTION get_analytics_summary(days_back integer DEFAULT 30)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH
  cutoff      AS (SELECT NOW() - (days_back || ' days')::interval AS ts),
  today_start AS (SELECT date_trunc('day', NOW()) AS ts),
  week_start  AS (SELECT NOW() - interval '7 days' AS ts),

  filtered AS (
    SELECT
      site,
      path,
      CASE
        WHEN referrer IS NULL THEN NULL
        WHEN referrer ~* '^https?://([^/?#]+)'
          THEN (regexp_match(referrer, '^https?://([^/?#]+)'))[1]
        ELSE referrer
      END AS referrer_host,
      CASE
        WHEN user_agent ILIKE '%iPhone%' OR user_agent ILIKE '%iPad%' THEN 'iOS'
        WHEN user_agent ILIKE '%Android%'                             THEN 'Android'
        WHEN user_agent ILIKE '%Windows%'                             THEN 'Windows'
        WHEN user_agent ILIKE '%Mac OS X%' OR
             user_agent ILIKE '%Macintosh%'                           THEN 'macOS'
        WHEN user_agent ILIKE '%Linux%'                               THEN 'Linux'
        WHEN user_agent IS NULL                                       THEN 'Unknown'
        ELSE 'Other'
      END AS os,
      country,
      visitor_hash,
      created_at
    FROM page_views
    WHERE created_at >= (SELECT ts FROM cutoff)
  ),

  -- Generate every date in range so days with zero views still appear
  date_series AS (
    SELECT generate_series(
      (CURRENT_DATE - (days_back - 1))::timestamp,
      CURRENT_DATE::timestamp,
      '1 day'::interval
    )::date AS day
  ),

  daily AS (
    SELECT
      ds.day::text AS date,
      COUNT(f.*) FILTER (WHERE f.site = 'app')::int AS app,
      COUNT(f.*) FILTER (WHERE f.site = 'cms')::int AS cms,
      COUNT(DISTINCT f.visitor_hash)::int           AS unique
    FROM date_series ds
    LEFT JOIN filtered f ON f.created_at::date = ds.day
    GROUP BY ds.day
    ORDER BY ds.day
  ),

  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE created_at >= (SELECT ts FROM today_start))::int                        AS today,
      COUNT(*) FILTER (WHERE created_at >= (SELECT ts FROM week_start))::int                         AS last7d,
      COUNT(*)::int                                                                                   AS last30d,
      COUNT(*) FILTER (WHERE created_at >= (SELECT ts FROM today_start) AND site = 'app')::int       AS today_app,
      COUNT(*) FILTER (WHERE created_at >= (SELECT ts FROM today_start) AND site = 'cms')::int       AS today_cms,
      COUNT(*) FILTER (WHERE created_at >= (SELECT ts FROM week_start)  AND site = 'app')::int       AS last7d_app,
      COUNT(*) FILTER (WHERE created_at >= (SELECT ts FROM week_start)  AND site = 'cms')::int       AS last7d_cms,
      COUNT(*) FILTER (WHERE site = 'app')::int                                                      AS last30d_app,
      COUNT(*) FILTER (WHERE site = 'cms')::int                                                      AS last30d_cms,
      COUNT(DISTINCT visitor_hash) FILTER (WHERE created_at >= (SELECT ts FROM today_start))::int    AS unique_today,
      COUNT(DISTINCT visitor_hash) FILTER (WHERE created_at >= (SELECT ts FROM week_start))::int     AS unique_last7d,
      COUNT(DISTINCT visitor_hash)::int                                                              AS unique_last30d
    FROM filtered
  ),

  top_app_pages AS (
    SELECT path, COUNT(*)::int AS views
    FROM filtered WHERE site = 'app'
    GROUP BY path ORDER BY views DESC LIMIT 10
  ),

  top_cms_pages AS (
    SELECT path, COUNT(*)::int AS views
    FROM filtered WHERE site = 'cms'
    GROUP BY path ORDER BY views DESC LIMIT 10
  ),

  top_countries AS (
    SELECT COALESCE(country, 'Unknown') AS label, COUNT(*)::int AS views
    FROM filtered
    GROUP BY country ORDER BY views DESC LIMIT 10
  ),

  top_os AS (
    SELECT os AS label, COUNT(*)::int AS views
    FROM filtered
    GROUP BY os ORDER BY views DESC LIMIT 10
  ),

  top_referrers AS (
    SELECT COALESCE(referrer_host, 'Direct') AS label, COUNT(*)::int AS views
    FROM filtered
    WHERE referrer_host IS NULL
       OR (referrer_host NOT ILIKE 'localhost%' AND referrer_host NOT ILIKE '127.0.0.1%')
    GROUP BY referrer_host ORDER BY views DESC LIMIT 10
  )

  SELECT json_build_object(
    'totals', (
      SELECT json_build_object(
        'today',        today,
        'last7d',       last7d,
        'last30d',      last30d,
        'todayBySite',  json_build_object('app', today_app,  'cms', today_cms),
        'last7dBySite', json_build_object('app', last7d_app, 'cms', last7d_cms),
        'last30dBySite',json_build_object('app', last30d_app,'cms', last30d_cms),
        'uniqueToday',  unique_today,
        'uniqueLast7d', unique_last7d,
        'uniqueLast30d',unique_last30d
      ) FROM totals
    ),
    'daily',    (SELECT COALESCE(json_agg(row_to_json(d)),  '[]'::json) FROM daily d),
    'topPages', json_build_object(
      'app', (SELECT COALESCE(json_agg(row_to_json(a)), '[]'::json) FROM top_app_pages a),
      'cms', (SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) FROM top_cms_pages c)
    ),
    'countries',(SELECT COALESCE(json_agg(row_to_json(co)), '[]'::json) FROM top_countries co),
    'os',       (SELECT COALESCE(json_agg(row_to_json(o)),  '[]'::json) FROM top_os o),
    'referrers',(SELECT COALESCE(json_agg(row_to_json(r)),  '[]'::json) FROM top_referrers r)
  )
$$;

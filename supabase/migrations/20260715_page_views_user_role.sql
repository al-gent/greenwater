-- Segment page views by authentication status / role.
-- null = anonymous visitor; 'scientist' | 'operator' | 'admin' when signed in.
-- Set by /api/analytics/pageview from the session at insert time.
alter table page_views add column if not exists user_role text;

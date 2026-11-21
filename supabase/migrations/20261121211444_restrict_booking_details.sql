-- Only approved vessel operators inherit access to another person's bid.
-- bid_gear_read already checks project_bids through this policy.
alter policy project_bids_read on public.project_bids using (
  offered_by = (select auth.uid())
  or exists (select 1 from public.projects p where p.id = project_bids.project_id and p.created_by = (select auth.uid()))
  or exists (select 1 from public.vessel_operators vo where vo.vessel_id = project_bids.vessel_id
             and vo.user_id = (select auth.uid()) and vo.status = 'active')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
);

alter policy timeline_entries_operators_read on public.timeline_entries using (
  deleted_at is null and (
    visibility = 'public' or created_by = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
    or (visibility = 'operators' and exists (
      select 1 from public.vessel_operators vo where vo.user_id = (select auth.uid()) and vo.status = 'active'
        and (timeline_entries.vessel_id is null or vo.vessel_id = timeline_entries.vessel_id)
    ))
  )
);

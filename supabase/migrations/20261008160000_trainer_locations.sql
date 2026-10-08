-- Clients can find trainers near them (Ryan, 2026-10-08: "nearest to the client").
-- A trainer saves a rough location in Voltrix Coach. Two decimals is about 1 km, and
-- the columns round anything more exact, so a trainer's exact spot is never stored.
alter table public.profiles
  add column if not exists latitude numeric(4, 2) check (latitude is null or latitude between -90 and 90),
  add column if not exists longitude numeric(5, 2) check (longitude is null or longitude between -180 and 180);

-- A location is both numbers or neither.
alter table public.profiles add constraint profiles_location_pair
  check ((latitude is null) = (longitude is null));

-- People can only read their own profile row (profiles_select_own), so only the
-- trainer sees their own location. Clients get distances from trainer_distances().
grant update (latitude, longitude) on public.profiles to authenticated;

-- How far each trainer with a location is from the given point, in km, for the
-- same trainers as list_trainers(). Only the distance leaves the database.
create or replace function public.trainer_distances(p_lat double precision, p_lng double precision)
returns table (id uuid, distance_km numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_lat is null or p_lng is null or not (p_lat between -90 and 90) or not (p_lng between -180 and 180) then
    raise exception 'Invalid location' using errcode = '22023';
  end if;
  return query
    select d.id, round(d.km::numeric, 1)
      from (
        select p.id,
               -- Great-circle (haversine) distance on a 6371 km Earth.
               2 * 6371 * asin(least(1, sqrt(
                 power(sin(radians(p.latitude::double precision - p_lat) / 2), 2)
                 + cos(radians(p_lat)) * cos(radians(p.latitude::double precision))
                   * power(sin(radians(p.longitude::double precision - p_lng) / 2), 2)
               ))) as km
          from public.profiles p
         where p.role = 'trainer'
           and p.business_name is not null
           and p.latitude is not null
           and p.longitude is not null
           and (
             p.free_access
             or p.is_admin
             or p.trial_ends_at > now()
             or (p.subscription_status in ('active', 'past_due', 'cancelled') and p.subscription_expires_at > now())
           )
      ) d
     order by d.km;
end;
$$;

revoke execute on function public.trainer_distances(double precision, double precision) from public, anon;
grant execute on function public.trainer_distances(double precision, double precision) to authenticated;

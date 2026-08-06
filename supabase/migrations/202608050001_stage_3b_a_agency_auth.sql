-- La Grandiosa Commerce — Stage 3B-A
-- Invite-only agency authentication, agency accounts, TOTP MFA enforcement,
-- staff roles, activation codes, and protected purchasing ownership.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ------------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------------
do $$
begin
  create type public.user_profile_status as enum (
    'pending_activation',
    'active',
    'suspended',
    'revoked'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agency_account_status as enum (
    'pending',
    'active',
    'suspended',
    'closed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agency_member_status as enum (
    'invited',
    'active',
    'suspended',
    'revoked'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agency_role as enum (
    'agency_buyer',
    'agency_admin'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.staff_role as enum (
    'sales_reviewer',
    'finance',
    'system_admin'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agency_invite_status as enum (
    'pending',
    'accepted',
    'expired',
    'revoked'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.discount_policy as enum (
    'stack',
    'best_of',
    'agency_replaces_campaign'
  );
exception
  when duplicate_object then null;
end $$;

-- ------------------------------------------------------------------
-- Numbering and shared helpers
-- ------------------------------------------------------------------
create sequence if not exists public.agency_account_number_seq start 1;

create or replace function public.next_agency_account_number()
returns text
language sql
security definer
set search_path = public
as $$
  select
    'LGA-' ||
    lpad(nextval('public.agency_account_number_seq')::text, 6, '0');
$$;

create or replace function public.session_is_aal2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$$;

-- ------------------------------------------------------------------
-- User, agency, staff, and invite records
-- ------------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  email citext not null unique,
  full_name text not null,
  telephone text,
  status public.user_profile_status not null default 'pending_activation',
  mfa_required boolean not null default true,
  mfa_enrolled_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (username::text ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$')
);

create index if not exists user_profiles_email_lower_idx
  on public.user_profiles (lower(email::text));

create table if not exists public.agency_accounts (
  id uuid primary key default gen_random_uuid(),
  account_number text not null unique default public.next_agency_account_number(),
  legal_name text not null,
  display_name text not null,
  status public.agency_account_status not null default 'pending',
  discount_basis_points integer not null default 0
    check (discount_basis_points between 0 and 10000),
  approved_credit_limit_cents bigint not null default 0
    check (approved_credit_limit_cents >= 0),
  payment_terms_days integer not null default 30
    check (payment_terms_days between 0 and 365),
  discount_policy public.discount_policy not null default 'stack',
  po_required boolean not null default true,
  authorized_email_domains text[] not null default '{}'::text[],
  effective_date date not null default current_date,
  expires_at date,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (expires_at is null or expires_at >= effective_date)
);

create index if not exists agency_accounts_status_idx
  on public.agency_accounts (status);

create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agency_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.agency_role not null default 'agency_buyer',
  status public.agency_member_status not null default 'invited',
  can_purchase boolean not null default true,
  invited_by_user_id uuid references auth.users(id),
  activated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (agency_id, user_id),
  unique (user_id)
);

create index if not exists agency_members_agency_id_idx
  on public.agency_members (agency_id);
create index if not exists agency_members_user_id_idx
  on public.agency_members (user_id);

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.agency_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agency_accounts(id) on delete cascade,
  email citext not null,
  role public.agency_role not null default 'agency_buyer',
  can_purchase boolean not null default true,
  invite_code_hash text not null unique,
  status public.agency_invite_status not null default 'pending',
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_by_user_id uuid references auth.users(id),
  auth_invited_at timestamptz,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists agency_invites_agency_id_idx
  on public.agency_invites (agency_id);
create index if not exists agency_invites_email_idx
  on public.agency_invites (lower(email::text));
create unique index if not exists agency_invites_one_pending_email_idx
  on public.agency_invites (agency_id, lower(email::text))
  where status = 'pending';

create table if not exists public.agency_account_history (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agency_accounts(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- Agency-scope client contacts so one agency cannot overwrite or read another
-- agency's contact record merely because the same email address was used.
alter table public.client_contacts
  add column if not exists agency_id uuid references public.agency_accounts(id);

create index if not exists client_contacts_agency_id_idx
  on public.client_contacts (agency_id);
create unique index if not exists client_contacts_agency_email_unique_idx
  on public.client_contacts (agency_id, lower(email))
  where agency_id is not null;

-- Orders created after this migration belong to a signed-in agency buyer.
alter table public.orders
  add column if not exists agency_id uuid references public.agency_accounts(id),
  add column if not exists ordered_by_user_id uuid references auth.users(id);

create index if not exists orders_agency_id_idx
  on public.orders (agency_id, created_at desc);
create index if not exists orders_ordered_by_user_id_idx
  on public.orders (ordered_by_user_id, created_at desc);

-- ------------------------------------------------------------------
-- Access helper functions
-- ------------------------------------------------------------------
create or replace function public.is_active_staff(
  p_roles public.staff_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_members staff
    where staff.user_id = auth.uid()
      and staff.active = true
      and (p_roles is null or staff.role = any(p_roles))
  );
$$;

create or replace function public.is_active_agency_member(
  p_agency_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_members member
    join public.agency_accounts agency
      on agency.id = member.agency_id
    where member.user_id = auth.uid()
      and member.agency_id = p_agency_id
      and member.status = 'active'
      and agency.status = 'active'
      and agency.effective_date <= current_date
      and (agency.expires_at is null or agency.expires_at >= current_date)
  );
$$;

create or replace function public.has_agency_role(
  p_agency_id uuid,
  p_roles public.agency_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_members member
    join public.agency_accounts agency
      on agency.id = member.agency_id
    where member.user_id = auth.uid()
      and member.agency_id = p_agency_id
      and member.status = 'active'
      and member.role = any(p_roles)
      and agency.status = 'active'
      and agency.effective_date <= current_date
      and (agency.expires_at is null or agency.expires_at >= current_date)
  );
$$;

-- ------------------------------------------------------------------
-- Activation and bootstrap functions
-- ------------------------------------------------------------------
create or replace function public.activate_agency_invite(
  p_invite_id uuid,
  p_username text,
  p_full_name text,
  p_telephone text,
  p_invite_code_hash text
)
returns table(
  agency_id uuid,
  agency_role public.agency_role,
  agency_display_name text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite public.agency_invites%rowtype;
  v_agency public.agency_accounts%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_username is null
     or p_username !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$' then
    raise exception 'Username format is invalid.';
  end if;

  select *
  into v_invite
  from public.agency_invites
  where id = p_invite_id
    and auth_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Agency invitation not found.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Agency invitation is no longer active.';
  end if;

  if v_invite.expires_at <= timezone('utc', now()) then
    update public.agency_invites
    set status = 'expired'
    where id = v_invite.id;
    raise exception 'Agency invitation has expired.';
  end if;

  if v_invite.invite_code_hash <> p_invite_code_hash then
    raise exception 'Agency activation code is invalid.';
  end if;

  select lower(email)
  into v_email
  from auth.users
  where id = v_user_id;

  if v_email is null or v_email <> lower(v_invite.email::text) then
    raise exception 'Invitation email does not match the authenticated user.';
  end if;

  select *
  into v_agency
  from public.agency_accounts
  where id = v_invite.agency_id;

  if not found
     or v_agency.status not in ('pending', 'active')
     or v_agency.effective_date > current_date
     or (v_agency.expires_at is not null and v_agency.expires_at < current_date) then
    raise exception 'Agency account is not available for activation.';
  end if;

  insert into public.user_profiles (
    user_id,
    username,
    email,
    full_name,
    telephone,
    status,
    mfa_required
  )
  values (
    v_user_id,
    p_username,
    v_email,
    p_full_name,
    nullif(p_telephone, ''),
    'active',
    true
  )
  on conflict (user_id) do update
  set
    username = excluded.username,
    email = excluded.email,
    full_name = excluded.full_name,
    telephone = excluded.telephone,
    status = 'active',
    mfa_required = true,
    updated_at = timezone('utc', now());

  insert into public.agency_members (
    agency_id,
    user_id,
    role,
    status,
    can_purchase,
    invited_by_user_id,
    activated_at
  )
  values (
    v_invite.agency_id,
    v_user_id,
    v_invite.role,
    'active',
    v_invite.can_purchase,
    v_invite.invited_by_user_id,
    timezone('utc', now())
  )
  on conflict (user_id) do update
  set
    agency_id = excluded.agency_id,
    role = excluded.role,
    status = 'active',
    can_purchase = excluded.can_purchase,
    invited_by_user_id = excluded.invited_by_user_id,
    activated_at = timezone('utc', now()),
    updated_at = timezone('utc', now());

  update public.agency_invites
  set
    status = 'accepted',
    accepted_at = timezone('utc', now())
  where id = v_invite.id;

  if v_agency.status = 'pending' then
    update public.agency_accounts
    set status = 'active'
    where id = v_agency.id;
  end if;

  insert into public.agency_account_history (
    agency_id,
    actor_user_id,
    event_key,
    metadata
  )
  values (
    v_invite.agency_id,
    v_user_id,
    'agency.user_activated',
    jsonb_build_object(
      'invite_id', v_invite.id,
      'role', v_invite.role,
      'username', p_username
    )
  );

  return query
  select v_invite.agency_id, v_invite.role, v_agency.display_name;
end;
$$;

create or replace function public.mark_current_user_mfa_enrolled()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.session_is_aal2() then
    raise exception 'AAL2 authentication is required.';
  end if;

  update public.user_profiles
  set
    mfa_enrolled_at = coalesce(mfa_enrolled_at, timezone('utc', now())),
    last_login_at = timezone('utc', now())
  where user_id = auth.uid();

  insert into public.audit_log (
    actor_user_id,
    event_key,
    entity_type,
    entity_id,
    metadata
  )
  values (
    auth.uid(),
    'user.mfa_verified',
    'user_profile',
    auth.uid()::text,
    jsonb_build_object('aal', 'aal2')
  );
end;
$$;

-- Run from the SQL Editor only after manually creating and confirming the
-- initial internal user in Supabase Authentication.
create or replace function public.bootstrap_staff_member(
  p_email text,
  p_username text,
  p_full_name text,
  p_role public.staff_role default 'system_admin'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  select id
  into v_user_id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'Create the Auth user before bootstrapping staff access.';
  end if;

  insert into public.user_profiles (
    user_id,
    username,
    email,
    full_name,
    status,
    mfa_required
  )
  values (
    v_user_id,
    p_username,
    lower(p_email),
    p_full_name,
    'active',
    true
  )
  on conflict (user_id) do update
  set
    username = excluded.username,
    email = excluded.email,
    full_name = excluded.full_name,
    status = 'active',
    mfa_required = true,
    updated_at = timezone('utc', now());

  insert into public.staff_members (user_id, role, active)
  values (v_user_id, p_role, true)
  on conflict (user_id) do update
  set
    role = excluded.role,
    active = true,
    updated_at = timezone('utc', now());

  return v_user_id;
end;
$$;

revoke all on function public.bootstrap_staff_member(text, text, text, public.staff_role)
  from public, anon, authenticated;

-- ------------------------------------------------------------------
-- Updated-at triggers
-- ------------------------------------------------------------------
drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists agency_accounts_set_updated_at on public.agency_accounts;
create trigger agency_accounts_set_updated_at
before update on public.agency_accounts
for each row execute function public.set_updated_at();

drop trigger if exists agency_members_set_updated_at on public.agency_members;
create trigger agency_members_set_updated_at
before update on public.agency_members
for each row execute function public.set_updated_at();

drop trigger if exists staff_members_set_updated_at on public.staff_members;
create trigger staff_members_set_updated_at
before update on public.staff_members
for each row execute function public.set_updated_at();

drop trigger if exists agency_invites_set_updated_at on public.agency_invites;
create trigger agency_invites_set_updated_at
before update on public.agency_invites
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.agency_accounts enable row level security;
alter table public.agency_members enable row level security;
alter table public.staff_members enable row level security;
alter table public.agency_invites enable row level security;
alter table public.agency_account_history enable row level security;

-- Drop policies so this migration can be rerun during development.
drop policy if exists user_profiles_select_self on public.user_profiles;
drop policy if exists user_profiles_update_self on public.user_profiles;
drop policy if exists agency_accounts_select_member_or_staff on public.agency_accounts;
drop policy if exists agency_members_select_self_admin_or_staff on public.agency_members;
drop policy if exists staff_members_select_self on public.staff_members;
drop policy if exists agency_history_select_member_or_staff on public.agency_account_history;
drop policy if exists orders_select_agency_or_staff on public.orders;
drop policy if exists order_items_select_agency_or_staff on public.order_items;
drop policy if exists client_contacts_select_agency_or_staff on public.client_contacts;

create policy user_profiles_select_self
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid());

create policy user_profiles_update_self
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy agency_accounts_select_member_or_staff
on public.agency_accounts
for select
to authenticated
using (
  public.session_is_aal2()
  and (
    public.is_active_agency_member(id)
    or public.is_active_staff(null)
  )
);

create policy agency_members_select_self_admin_or_staff
on public.agency_members
for select
to authenticated
using (
  public.session_is_aal2()
  and (
    user_id = auth.uid()
    or public.has_agency_role(
      agency_id,
      array['agency_admin']::public.agency_role[]
    )
    or public.is_active_staff(null)
  )
);

create policy staff_members_select_self
on public.staff_members
for select
to authenticated
using (
  public.session_is_aal2()
  and user_id = auth.uid()
);

create policy agency_history_select_member_or_staff
on public.agency_account_history
for select
to authenticated
using (
  public.session_is_aal2()
  and (
    public.is_active_agency_member(agency_id)
    or public.is_active_staff(null)
  )
);

-- Existing Stage 3A tables were already RLS-enabled. Add authenticated read
-- policies now that orders belong to an agency account.
create policy orders_select_agency_or_staff
on public.orders
for select
to authenticated
using (
  public.session_is_aal2()
  and agency_id is not null
  and (
    public.is_active_agency_member(agency_id)
    or public.is_active_staff(null)
  )
);

create policy order_items_select_agency_or_staff
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders order_record
    where order_record.id = order_items.order_id
      and public.session_is_aal2()
      and order_record.agency_id is not null
      and (
        public.is_active_agency_member(order_record.agency_id)
        or public.is_active_staff(null)
      )
  )
);

create policy client_contacts_select_agency_or_staff
on public.client_contacts
for select
to authenticated
using (
  public.session_is_aal2()
  and agency_id is not null
  and (
    public.is_active_agency_member(agency_id)
    or public.is_active_staff(null)
  )
);

-- Activation and MFA functions are available only to signed-in users.
grant execute on function public.activate_agency_invite(uuid, text, text, text, text)
  to authenticated;
grant execute on function public.mark_current_user_mfa_enrolled()
  to authenticated;

-- Limit direct profile updates to non-security columns.
revoke update on public.user_profiles from authenticated;
grant update (username, full_name, telephone) on public.user_profiles
  to authenticated;

-- Read permissions are still constrained by RLS.
grant select on public.user_profiles to authenticated;
grant select on public.agency_accounts to authenticated;
grant select on public.agency_members to authenticated;
grant select on public.staff_members to authenticated;
grant select on public.agency_account_history to authenticated;

-- ------------------------------------------------------------------
-- Atomic agency order creation RPC
-- ------------------------------------------------------------------
create or replace function public.create_agency_order_draft(
  p_client jsonb,
  p_order jsonb,
  p_items jsonb,
  p_notifications jsonb default '[]'::jsonb
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_client_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_agency_id uuid;
  v_ordered_by_user_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  v_agency_id := nullif(p_order->>'agency_id', '')::uuid;
  v_ordered_by_user_id := nullif(p_order->>'ordered_by_user_id', '')::uuid;

  if v_agency_id is null or v_ordered_by_user_id is null then
    raise exception 'Agency and authenticated purchaser are required.';
  end if;

  if not exists (
    select 1
    from public.agency_members member
    join public.agency_accounts agency
      on agency.id = member.agency_id
    where member.agency_id = v_agency_id
      and member.user_id = v_ordered_by_user_id
      and member.status = 'active'
      and member.can_purchase = true
      and agency.status = 'active'
      and agency.effective_date <= current_date
      and (agency.expires_at is null or agency.expires_at >= current_date)
  ) then
    raise exception 'The authenticated user is not authorized to purchase for this agency.';
  end if;

  select id
  into v_client_id
  from public.client_contacts
  where agency_id = v_agency_id
    and lower(email) = lower(p_client->>'email')
  order by updated_at desc
  limit 1;

  if v_client_id is null then
    insert into public.client_contacts (
      agency_id,
      full_name,
      email,
      telephone,
      address_line_1,
      address_line_2,
      city,
      region,
      postal_code,
      country,
      company_name,
      agency_name,
      campaign_name,
      purchase_order_number,
      sms_transactional_consent
    )
    values (
      v_agency_id,
      p_client->>'full_name',
      lower(p_client->>'email'),
      p_client->>'telephone',
      p_client->>'address_line_1',
      nullif(p_client->>'address_line_2', ''),
      p_client->>'city',
      p_client->>'region',
      p_client->>'postal_code',
      p_client->>'country',
      nullif(p_client->>'company_name', ''),
      nullif(p_client->>'agency_name', ''),
      nullif(p_client->>'campaign_name', ''),
      nullif(p_client->>'purchase_order_number', ''),
      coalesce((p_client->>'sms_transactional_consent')::boolean, false)
    )
    returning id into v_client_id;
  else
    update public.client_contacts
    set
      agency_id = v_agency_id,
      full_name = p_client->>'full_name',
      telephone = p_client->>'telephone',
      address_line_1 = p_client->>'address_line_1',
      address_line_2 = nullif(p_client->>'address_line_2', ''),
      city = p_client->>'city',
      region = p_client->>'region',
      postal_code = p_client->>'postal_code',
      country = p_client->>'country',
      company_name = nullif(p_client->>'company_name', ''),
      agency_name = nullif(p_client->>'agency_name', ''),
      campaign_name = nullif(p_client->>'campaign_name', ''),
      purchase_order_number = nullif(p_client->>'purchase_order_number', ''),
      sms_transactional_consent = coalesce(
        (p_client->>'sms_transactional_consent')::boolean,
        false
      )
    where id = v_client_id;
  end if;

  v_order_number := public.next_order_number();

  insert into public.orders (
    order_number,
    client_contact_id,
    agency_id,
    ordered_by_user_id,
    status,
    currency,
    gross_media_subtotal_cents,
    closed_holiday_deduction_cents,
    adjusted_media_subtotal_cents,
    date_selection_premium_cents,
    multi_month_discount_cents,
    tax_cents,
    total_cents,
    client_snapshot,
    pricing_snapshot,
    source
  )
  values (
    v_order_number,
    v_client_id,
    v_agency_id,
    v_ordered_by_user_id,
    'client_information_received',
    coalesce(p_order->>'currency', 'USD'),
    coalesce((p_order->>'gross_media_subtotal_cents')::bigint, 0),
    coalesce((p_order->>'closed_holiday_deduction_cents')::bigint, 0),
    coalesce((p_order->>'adjusted_media_subtotal_cents')::bigint, 0),
    coalesce((p_order->>'date_selection_premium_cents')::bigint, 0),
    coalesce((p_order->>'multi_month_discount_cents')::bigint, 0),
    coalesce((p_order->>'tax_cents')::bigint, 0),
    coalesce((p_order->>'total_cents')::bigint, 0),
    p_client,
    coalesce(p_order->'pricing_snapshot', '{}'::jsonb),
    coalesce(p_order->>'source', 'agency_portal')
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id,
    cart_item_id,
    sort_order,
    sku,
    start_date,
    end_date,
    combination_snapshot,
    pricing_snapshot,
    total_cents
  )
  select
    v_order_id,
    item->>'cart_item_id',
    coalesce((item->>'sort_order')::integer, 0),
    item->>'sku',
    (item->>'start_date')::date,
    (item->>'end_date')::date,
    item->'combination_snapshot',
    item->'pricing_snapshot',
    (item->>'total_cents')::bigint
  from jsonb_array_elements(p_items) as item;

  insert into public.order_status_history (
    order_id,
    previous_status,
    new_status,
    actor_user_id,
    note,
    metadata
  )
  values (
    v_order_id,
    null,
    'client_information_received',
    v_ordered_by_user_id,
    'Agency client information received through the authenticated portal.',
    jsonb_build_object(
      'source', 'agency_portal',
      'agency_id', v_agency_id
    )
  );

  insert into public.audit_log (
    order_id,
    actor_user_id,
    event_key,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_order_id,
    v_ordered_by_user_id,
    'order.client_information_received',
    'order',
    v_order_id::text,
    jsonb_build_object(
      'order_number', v_order_number,
      'agency_id', v_agency_id,
      'item_count', jsonb_array_length(p_items)
    )
  );

  insert into public.notification_outbox (
    order_id,
    channel,
    template_key,
    recipient,
    sender_email,
    reply_to_email,
    payload,
    dedupe_key
  )
  select
    v_order_id,
    (notification->>'channel')::public.notification_channel,
    notification->>'template_key',
    notification->>'recipient',
    nullif(notification->>'sender_email', ''),
    nullif(notification->>'reply_to_email', ''),
    coalesce(notification->'payload', '{}'::jsonb) ||
      jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'agency_id', v_agency_id
      ),
    notification->>'dedupe_key'
  from jsonb_array_elements(coalesce(p_notifications, '[]'::jsonb))
    as notification
  on conflict (dedupe_key) do nothing;

  return query select v_order_id, v_order_number;
end;
$$;

revoke all on function public.create_agency_order_draft(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_agency_order_draft(jsonb, jsonb, jsonb, jsonb)
  to service_role;

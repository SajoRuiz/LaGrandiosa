-- La Grandiosa Commerce — Stage 3A
-- Secure order records, client information, status history, audit log,
-- and notification outbox.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------------
do $$
begin
  create type public.order_status as enum (
    'draft',
    'client_information_received',
    'pending_contract_acceptance',
    'pending_payment',
    'payment_processing',
    'payment_failed',
    'paid',
    'client_code_pending',
    'client_code_approved',
    'client_code_declined',
    'awaiting_assets',
    'assets_received',
    'under_review',
    'revision_requested',
    'approved',
    'release_pending',
    'released',
    'live',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_method as enum (
    'credit_card',
    'ach',
    'client_code'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum (
    'not_started',
    'pending',
    'processing',
    'succeeded',
    'failed',
    'refunded',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_channel as enum ('email', 'sms');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_status as enum (
    'queued',
    'processing',
    'sent',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

-- ------------------------------------------------------------------
-- Shared helpers
-- ------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1;

create or replace function public.next_order_number()
returns text
language sql
security definer
set search_path = public
as $$
  select
    'LG-' ||
    to_char(timezone('utc', now()), 'YYYY') ||
    '-' ||
    lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- Client and order data
-- ------------------------------------------------------------------
create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  telephone text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  region text not null,
  postal_code text not null,
  country text not null,
  company_name text,
  agency_name text,
  campaign_name text,
  purchase_order_number text,
  sms_transactional_consent boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists client_contacts_email_lower_idx
  on public.client_contacts (lower(email));

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  client_contact_id uuid not null references public.client_contacts(id),
  status public.order_status not null default 'draft',
  currency text not null default 'USD' check (currency = 'USD'),
  gross_media_subtotal_cents bigint not null default 0 check (gross_media_subtotal_cents >= 0),
  closed_holiday_deduction_cents bigint not null default 0 check (closed_holiday_deduction_cents >= 0),
  adjusted_media_subtotal_cents bigint not null default 0 check (adjusted_media_subtotal_cents >= 0),
  date_selection_premium_cents bigint not null default 0 check (date_selection_premium_cents >= 0),
  multi_month_discount_cents bigint not null default 0 check (multi_month_discount_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  payment_method public.payment_method,
  payment_status public.payment_status not null default 'not_started',
  payment_reference text,
  client_snapshot jsonb not null,
  pricing_snapshot jsonb not null,
  contract_snapshot jsonb,
  source text not null default 'web_checkout',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists orders_client_contact_id_idx
  on public.orders (client_contact_id);
create index if not exists orders_status_idx
  on public.orders (status);
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  cart_item_id text not null,
  sort_order integer not null default 0,
  sku text not null,
  start_date date not null,
  end_date date not null,
  combination_snapshot jsonb not null,
  pricing_snapshot jsonb not null,
  total_cents bigint not null check (total_cents >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (order_id, cart_item_id),
  check (end_date >= start_date)
);

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);
create index if not exists order_items_date_range_idx
  on public.order_items (start_date, end_date);
create index if not exists order_items_sku_idx
  on public.order_items (sku);

-- ------------------------------------------------------------------
-- Status engine
-- ------------------------------------------------------------------
create table if not exists public.order_status_transition_rules (
  from_status public.order_status not null,
  to_status public.order_status not null,
  primary key (from_status, to_status)
);

insert into public.order_status_transition_rules (from_status, to_status)
values
  ('draft', 'client_information_received'),
  ('client_information_received', 'pending_contract_acceptance'),
  ('pending_contract_acceptance', 'pending_payment'),
  ('pending_payment', 'payment_processing'),
  ('pending_payment', 'paid'),
  ('pending_payment', 'client_code_pending'),
  ('payment_processing', 'paid'),
  ('payment_processing', 'payment_failed'),
  ('payment_failed', 'pending_payment'),
  ('client_code_pending', 'client_code_approved'),
  ('client_code_pending', 'client_code_declined'),
  ('client_code_declined', 'pending_payment'),
  ('paid', 'awaiting_assets'),
  ('client_code_approved', 'awaiting_assets'),
  ('awaiting_assets', 'assets_received'),
  ('assets_received', 'under_review'),
  ('under_review', 'revision_requested'),
  ('under_review', 'approved'),
  ('revision_requested', 'assets_received'),
  ('approved', 'release_pending'),
  ('release_pending', 'released'),
  ('released', 'live'),
  ('live', 'completed'),
  ('draft', 'cancelled'),
  ('client_information_received', 'cancelled'),
  ('pending_contract_acceptance', 'cancelled'),
  ('pending_payment', 'cancelled'),
  ('payment_processing', 'cancelled'),
  ('payment_failed', 'cancelled'),
  ('client_code_pending', 'cancelled'),
  ('client_code_declined', 'cancelled'),
  ('awaiting_assets', 'cancelled')
on conflict do nothing;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status public.order_status,
  new_status public.order_status not null,
  actor_user_id uuid,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists order_status_history_order_id_idx
  on public.order_status_history (order_id, created_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  actor_user_id uuid,
  event_key text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_log_order_id_idx
  on public.audit_log (order_id, created_at desc);
create index if not exists audit_log_event_key_idx
  on public.audit_log (event_key, created_at desc);

-- ------------------------------------------------------------------
-- Notification outbox
-- Sending workers are added in Stage 3B.
-- ------------------------------------------------------------------
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  channel public.notification_channel not null,
  template_key text not null,
  recipient text not null,
  sender_email text,
  reply_to_email text,
  payload jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'queued',
  dedupe_key text not null unique,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default timezone('utc', now()),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists notification_outbox_delivery_idx
  on public.notification_outbox (status, next_attempt_at, created_at);
create index if not exists notification_outbox_order_id_idx
  on public.notification_outbox (order_id);

-- Future inventory engine placeholder. No active hold is created in Stage 3A.
create table if not exists public.inventory_holds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  sku text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'pending_capacity_check',
  held_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_date >= start_date)
);

-- ------------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------------
drop trigger if exists client_contacts_set_updated_at on public.client_contacts;
create trigger client_contacts_set_updated_at
before update on public.client_contacts
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at
before update on public.notification_outbox
for each row execute function public.set_updated_at();

drop trigger if exists inventory_holds_set_updated_at on public.inventory_holds;
create trigger inventory_holds_set_updated_at
before update on public.inventory_holds
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- Atomic order creation RPC
-- ------------------------------------------------------------------
create or replace function public.create_order_draft(
  p_client jsonb,
  p_order jsonb,
  p_items jsonb,
  p_notifications jsonb default '[]'::jsonb
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_order_id uuid;
  v_order_number text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  select id
  into v_client_id
  from public.client_contacts
  where lower(email) = lower(p_client->>'email')
  order by updated_at desc
  limit 1;

  if v_client_id is null then
    insert into public.client_contacts (
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
    coalesce(p_order->>'source', 'web_checkout')
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
    note,
    metadata
  )
  values (
    v_order_id,
    null,
    'client_information_received',
    'Client information received through the website checkout.',
    jsonb_build_object('source', 'web_checkout')
  );

  insert into public.audit_log (
    order_id,
    event_key,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_order_id,
    'order.client_information_received',
    'order',
    v_order_id::text,
    jsonb_build_object(
      'order_number', v_order_number,
      'client_email', lower(p_client->>'email'),
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
        'order_number', v_order_number
      ),
    notification->>'dedupe_key'
  from jsonb_array_elements(coalesce(p_notifications, '[]'::jsonb))
    as notification
  on conflict (dedupe_key) do nothing;

  return query select v_order_id, v_order_number;
end;
$$;

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_new_status public.order_status,
  p_actor_user_id uuid default null,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status public.order_status;
begin
  select status
  into v_current_status
  from public.orders
  where id = p_order_id
  for update;

  if v_current_status is null then
    raise exception 'Order not found.';
  end if;

  if v_current_status = p_new_status then
    return v_current_status;
  end if;

  if not exists (
    select 1
    from public.order_status_transition_rules
    where from_status = v_current_status
      and to_status = p_new_status
  ) then
    raise exception 'Invalid order status transition: % -> %',
      v_current_status,
      p_new_status;
  end if;

  update public.orders
  set status = p_new_status
  where id = p_order_id;

  insert into public.order_status_history (
    order_id,
    previous_status,
    new_status,
    actor_user_id,
    note,
    metadata
  )
  values (
    p_order_id,
    v_current_status,
    p_new_status,
    p_actor_user_id,
    p_note,
    coalesce(p_metadata, '{}'::jsonb)
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
    p_order_id,
    p_actor_user_id,
    'order.status_changed',
    'order',
    p_order_id::text,
    jsonb_build_object(
      'previous_status', v_current_status,
      'new_status', p_new_status,
      'note', p_note
    ) || coalesce(p_metadata, '{}'::jsonb)
  );

  return p_new_status;
end;
$$;

-- ------------------------------------------------------------------
-- Row Level Security
-- Stage 3A intentionally exposes no client-side policies.
-- Server routes use the service-role key. Client portal policies arrive
-- with authenticated access in Stage 3B.
-- ------------------------------------------------------------------
alter table public.client_contacts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_transition_rules enable row level security;
alter table public.order_status_history enable row level security;
alter table public.audit_log enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.inventory_holds enable row level security;

revoke all on table public.client_contacts from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.order_status_transition_rules from anon, authenticated;
revoke all on table public.order_status_history from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;
revoke all on table public.notification_outbox from anon, authenticated;
revoke all on table public.inventory_holds from anon, authenticated;

revoke all on function public.create_order_draft(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.transition_order_status(
  uuid,
  public.order_status,
  uuid,
  text,
  jsonb
) from public, anon, authenticated;
revoke all on function public.next_order_number()
  from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on table public.client_contacts to service_role;
grant all on table public.orders to service_role;
grant all on table public.order_items to service_role;
grant all on table public.order_status_transition_rules to service_role;
grant all on table public.order_status_history to service_role;
grant all on table public.audit_log to service_role;
grant all on table public.notification_outbox to service_role;
grant all on table public.inventory_holds to service_role;
grant usage, select on sequence public.order_number_seq to service_role;
grant execute on function public.create_order_draft(jsonb, jsonb, jsonb, jsonb)
  to service_role;
grant execute on function public.transition_order_status(
  uuid,
  public.order_status,
  uuid,
  text,
  jsonb
) to service_role;
grant execute on function public.next_order_number() to service_role;

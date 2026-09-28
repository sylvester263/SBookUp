
-- ============ EXTENSIONS ============
create extension if not exists pg_trgm;

-- ============ ENUMS ============
create type public.app_role as enum ('customer', 'manager', 'admin');
create type public.order_status as enum ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.payment_method as enum ('cod', 'jazzcash', 'easypaisa', 'stripe', 'bank_transfer');
create type public.coupon_type as enum ('percentage', 'fixed', 'free_shipping');
create type public.banner_position as enum ('hero', 'section', 'sidebar');

-- ============ HELPER: updated_at trigger ============
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- ============ USER ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create policy "user_roles_select_own" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "user_roles_admin_all" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ============ AUTH SIGNUP TRIGGER ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ ADDRESSES ============
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  street text not null,
  city text not null,
  province text,
  postal_code text,
  phone text,
  is_default boolean not null default false,
  lat numeric(10,7),
  lng numeric(10,7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.addresses to authenticated;
grant all on public.addresses to service_role;
alter table public.addresses enable row level security;
create policy "addresses_own" on public.addresses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "addresses_staff_read" on public.addresses for select to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create trigger addresses_updated_at before update on public.addresses for each row execute function public.set_updated_at();

-- ============ CATEGORIES ============
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  parent_id uuid references public.categories(id) on delete set null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "categories_public_read" on public.categories for select to anon, authenticated using (is_active or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create policy "categories_staff_write" on public.categories for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create index categories_parent_idx on public.categories(parent_id);
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();

-- ============ PRODUCTS ============
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sku text unique,
  isbn text,
  category_id uuid references public.categories(id) on delete set null,
  brand text,
  author text,
  publisher text,
  edition text,
  price numeric(12,2) not null check (price >= 0),
  sale_price numeric(12,2) check (sale_price >= 0),
  cost_price numeric(12,2),
  stock_quantity integer not null default 0,
  low_stock_threshold integer not null default 5,
  weight_grams integer,
  images text[] not null default '{}',
  tags text[] not null default '{}',
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products_public_read" on public.products for select to anon, authenticated using (is_active or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create policy "products_staff_write" on public.products for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create index products_category_idx on public.products(category_id);
create index products_featured_idx on public.products(is_featured) where is_featured;
create index products_name_trgm on public.products using gin (name gin_trgm_ops);
create index products_desc_trgm on public.products using gin (description gin_trgm_ops);
create index products_sku_trgm on public.products using gin (sku gin_trgm_ops);
create index products_isbn_trgm on public.products using gin (isbn gin_trgm_ops);
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();

-- ============ PRODUCT VARIANTS ============
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text unique,
  price_modifier numeric(12,2) not null default 0,
  stock integer not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.product_variants to anon, authenticated;
grant insert, update, delete on public.product_variants to authenticated;
grant all on public.product_variants to service_role;
alter table public.product_variants enable row level security;
create policy "variants_public_read" on public.product_variants for select to anon, authenticated using (true);
create policy "variants_staff_write" on public.product_variants for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

-- ============ BUNDLES ============
create table public.bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  exam_board text,
  class_level text,
  school_name text,
  total_price numeric(12,2) not null default 0,
  discounted_price numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.bundles to anon, authenticated;
grant insert, update, delete on public.bundles to authenticated;
grant all on public.bundles to service_role;
alter table public.bundles enable row level security;
create policy "bundles_public_read" on public.bundles for select to anon, authenticated using (is_active or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create policy "bundles_staff_write" on public.bundles for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create trigger bundles_updated_at before update on public.bundles for each row execute function public.set_updated_at();

-- ============ BUNDLE ITEMS ============
create table public.bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0)
);
grant select on public.bundle_items to anon, authenticated;
grant insert, update, delete on public.bundle_items to authenticated;
grant all on public.bundle_items to service_role;
alter table public.bundle_items enable row level security;
create policy "bundle_items_public_read" on public.bundle_items for select to anon, authenticated using (true);
create policy "bundle_items_staff_write" on public.bundle_items for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create index bundle_items_bundle_idx on public.bundle_items(bundle_id);

-- ============ SHIPPING ZONES ============
create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cities text[] not null default '{}',
  base_rate numeric(12,2) not null default 0,
  per_kg_rate numeric(12,2) not null default 0,
  estimated_days integer not null default 3,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.shipping_zones to anon, authenticated;
grant insert, update, delete on public.shipping_zones to authenticated;
grant all on public.shipping_zones to service_role;
alter table public.shipping_zones enable row level security;
create policy "shipping_public_read" on public.shipping_zones for select to anon, authenticated using (is_active or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create policy "shipping_staff_write" on public.shipping_zones for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

-- ============ COUPONS ============
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type public.coupon_type not null,
  value numeric(12,2) not null default 0,
  min_order_amount numeric(12,2) not null default 0,
  max_uses integer,
  uses_count integer not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.coupons to authenticated;
grant insert, update, delete on public.coupons to authenticated;
grant all on public.coupons to service_role;
alter table public.coupons enable row level security;
create policy "coupons_authenticated_read" on public.coupons for select to authenticated using (is_active);
create policy "coupons_staff_write" on public.coupons for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

-- ============ ORDERS ============
create sequence if not exists public.order_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  payment_method public.payment_method not null default 'cod',
  subtotal numeric(12,2) not null default 0,
  shipping_cost numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  shipping_address jsonb not null,
  coupon_code text,
  tracking_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "orders_owner_read" on public.orders for select to authenticated using (user_id = auth.uid());
create policy "orders_owner_insert" on public.orders for insert to authenticated with check (user_id = auth.uid() or user_id is null);
create policy "orders_staff_all" on public.orders for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create index orders_user_idx on public.orders(user_id);
create index orders_status_idx on public.orders(status);
create index orders_created_idx on public.orders(created_at desc);
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

create or replace function public.set_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'JSN-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
  end if;
  return new;
end; $$;
create trigger orders_set_number before insert on public.orders for each row execute function public.set_order_number();

-- ============ ORDER ITEMS ============
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  bundle_id uuid references public.bundles(id) on delete set null,
  name_snapshot text not null,
  price_snapshot numeric(12,2) not null,
  quantity integer not null check (quantity > 0),
  subtotal numeric(12,2) not null
);
grant select, insert on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy "order_items_owner_read" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "order_items_owner_insert" on public.order_items for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or o.user_id is null)));
create policy "order_items_staff_all" on public.order_items for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create index order_items_order_idx on public.order_items(order_id);

-- ============ CART ITEMS ============
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text,
  product_id uuid references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  bundle_id uuid references public.bundles(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  check (user_id is not null or session_id is not null)
);
grant select, insert, update, delete on public.cart_items to anon, authenticated;
grant all on public.cart_items to service_role;
alter table public.cart_items enable row level security;
create policy "cart_owner" on public.cart_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cart_guest" on public.cart_items for all to anon using (user_id is null and session_id is not null) with check (user_id is null and session_id is not null);
create index cart_user_idx on public.cart_items(user_id);
create index cart_session_idx on public.cart_items(session_id);

-- ============ WISHLIST ============
create table public.wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
grant select, insert, delete on public.wishlist to authenticated;
grant all on public.wishlist to service_role;
alter table public.wishlist enable row level security;
create policy "wishlist_own" on public.wishlist for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ REVIEWS ============
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  is_verified_purchase boolean not null default false,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;
create policy "reviews_public_read_approved" on public.reviews for select to anon, authenticated using (is_approved);
create policy "reviews_owner_read" on public.reviews for select to authenticated using (user_id = auth.uid());
create policy "reviews_owner_write" on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy "reviews_owner_update" on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reviews_staff_all" on public.reviews for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

-- ============ BANNERS ============
create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text not null,
  link_url text,
  position public.banner_position not null default 'hero',
  display_order integer not null default 0,
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.banners to anon, authenticated;
grant insert, update, delete on public.banners to authenticated;
grant all on public.banners to service_role;
alter table public.banners enable row level security;
create policy "banners_public_read" on public.banners for select to anon, authenticated using (is_active or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create policy "banners_staff_write" on public.banners for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

-- ============ NEWSLETTERS ============
create table public.newsletters (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
grant insert on public.newsletters to anon, authenticated;
grant select, update, delete on public.newsletters to authenticated;
grant all on public.newsletters to service_role;
alter table public.newsletters enable row level security;
create policy "newsletters_public_insert" on public.newsletters for insert to anon, authenticated with check (true);
create policy "newsletters_staff_all" on public.newsletters for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

-- ============ REMINDERS ============
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  bundle_id uuid references public.bundles(id) on delete cascade,
  reminder_type text not null,
  trigger_date timestamptz not null,
  sent_at timestamptz,
  message text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.reminders to authenticated;
grant all on public.reminders to service_role;
alter table public.reminders enable row level security;
create policy "reminders_own" on public.reminders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reminders_staff_all" on public.reminders for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

-- ============ ACTIVITY LOGS ============
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.activity_logs to authenticated;
grant all on public.activity_logs to service_role;
alter table public.activity_logs enable row level security;
create policy "activity_admin_read" on public.activity_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "activity_staff_insert" on public.activity_logs for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

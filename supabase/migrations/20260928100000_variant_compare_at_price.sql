-- Homepage 1.1: a "was" price for variants, shown struck through next to the
-- variant's price. Display only: quote_order / place_order never read it, so
-- what the customer pays is unchanged.
--
-- Products already have this pair: `price` is the regular price and
-- `sale_price` the discounted one (the storefront strikes through `price`
-- whenever `sale_price` is lower), so products get no new column.

alter table public.product_variants
  add column if not exists compare_at_price numeric(12,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'product_variants_compare_at_price_check') then
    alter table public.product_variants add constraint product_variants_compare_at_price_check
      check (compare_at_price is null or compare_at_price >= 0);
  end if;
end $$;

comment on column public.product_variants.compare_at_price is
  'Display-only "was" price; struck through when higher than the variant''s price. Not used for charging.';

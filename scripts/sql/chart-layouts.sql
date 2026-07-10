-- بورس سنج — قالب‌ها و نماهای ذخیره‌شده نمودار تکنیکال (هر کاربر مال خودش)
-- در SQL Editor سوپابیس اجرا کنید.

create table if not exists public.chart_layouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('layout', 'snapshot')),
  name       text not null,
  symbol     text,                       -- فقط برای snapshot
  config     jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists chart_layouts_user_kind_idx
  on public.chart_layouts (user_id, kind, created_at desc);

alter table public.chart_layouts enable row level security;

drop policy if exists "chart_layouts own rows" on public.chart_layouts;
create policy "chart_layouts own rows"
  on public.chart_layouts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- برای «کپی لینک تصویر»: در بخش Storage یک باکت عمومی به نام chart-images بسازید
-- (Storage → New bucket → name: chart-images → Public bucket ✓)
-- و این policy را اجرا کنید تا کاربران لاگین‌کرده آپلود کنند:
drop policy if exists "chart images upload" on storage.objects;
create policy "chart images upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'chart-images');

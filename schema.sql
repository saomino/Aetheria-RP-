-- =====================================================================
--  AETHERIA — base de données Supabase
--  À coller en entier dans Supabase > SQL Editor > New query > Run
--  (on peut le relancer sans risque)
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.profils (
  id         uuid primary key references auth.users on delete cascade,
  pseudo     text not null unique check (char_length(trim(pseudo)) between 2 and 30),
  role       text not null default 'membre' check (role in ('admin', 'membre', 'banni')),
  cree_le    timestamptz not null default now()
);

create table if not exists public.invitations (
  code              text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  note              text,
  max_utilisations  int default 1,          -- null = illimité
  utilisations      int not null default 0,
  expire_le         timestamptz,            -- null = n'expire jamais
  cree_par          uuid references auth.users on delete set null,
  cree_le           timestamptz not null default now()
);

create table if not exists public.fiches (
  id          uuid primary key default gen_random_uuid(),
  categorie   text not null check (categorie ~ '^[a-z0-9-]{2,40}$'),
  titre       text not null check (char_length(trim(titre)) between 1 and 120),
  resume      text check (char_length(resume) <= 400),
  image_url   text check (image_url is null or image_url ~ '^https?://'),
  infos       jsonb not null default '[]'::jsonb,   -- [{"cle":"Âge","valeur":"27 ans"}, ...]
  contenu     text not null default '' check (char_length(contenu) <= 100000),
  annee       int,                                  -- utile pour la chronologie
  galerie     jsonb not null default '[]'::jsonb,   -- [{"url":"https://…","legende":"Tenue de combat"}, ...]
  auteur_id   uuid references public.profils(id) on delete set null default auth.uid(),
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);

-- (pour les sites déjà installés avant l'ajout de la galerie)
alter table public.fiches add column if not exists galerie jsonb not null default '[]'::jsonb;
alter table public.fiches drop constraint if exists galerie_max;
alter table public.fiches add constraint galerie_max check (jsonb_typeof(galerie) = 'array' and jsonb_array_length(galerie) <= 100);

create index if not exists fiches_categorie_idx on public.fiches (categorie);
create index if not exists fiches_auteur_idx on public.fiches (auteur_id);

-- ---------- Fonctions utilitaires ------------------------------------

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and role = 'admin');
$$;

create or replace function public.est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and role in ('admin', 'membre'));
$$;

-- Date de modification automatique
create or replace function public.maj_modifie_le() returns trigger
language plpgsql as $$
begin
  new.modifie_le := now();
  new.auteur_id := old.auteur_id;   -- l'auteur d'origine ne change jamais
  return new;
end $$;

drop trigger if exists fiches_maj on public.fiches;
create trigger fiches_maj before update on public.fiches
for each row execute function public.maj_modifie_le();

-- Rejoindre le site avec un code d'invitation.
-- Le TOUT PREMIER compte devient automatiquement admin (pas besoin d'invitation).
create or replace function public.rejoindre(code_invitation text, pseudo_choisi text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  inv invitations;
  p   text := trim(pseudo_choisi);
begin
  if auth.uid() is null then
    raise exception 'Tu dois être connecté.';
  end if;

  if exists (select 1 from profils where id = auth.uid()) then
    return (select role from profils where id = auth.uid());
  end if;

  if char_length(coalesce(p, '')) < 2 then
    raise exception 'Pseudo trop court.';
  end if;
  if exists (select 1 from profils where lower(pseudo) = lower(p)) then
    raise exception 'Ce pseudo est déjà pris.';
  end if;

  -- Premier inscrit = admin
  if not exists (select 1 from profils) then
    insert into profils (id, pseudo, role) values (auth.uid(), p, 'admin');
    return 'admin';
  end if;

  select * into inv from invitations where code = code_invitation for update;
  if not found then
    raise exception 'Lien d''invitation invalide.';
  end if;
  if inv.expire_le is not null and inv.expire_le < now() then
    raise exception 'Ce lien d''invitation a expiré.';
  end if;
  if inv.max_utilisations is not null and inv.utilisations >= inv.max_utilisations then
    raise exception 'Ce lien d''invitation a déjà été utilisé.';
  end if;

  update invitations set utilisations = utilisations + 1 where code = inv.code;
  insert into profils (id, pseudo, role) values (auth.uid(), p, 'membre');
  return 'membre';
end $$;

-- Un membre peut changer son propre pseudo (mais pas son rôle)
create or replace function public.changer_pseudo(nouveau text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(nouveau, ''))) < 2 then
    raise exception 'Pseudo trop court.';
  end if;
  if exists (select 1 from profils where lower(pseudo) = lower(trim(nouveau)) and id <> auth.uid()) then
    raise exception 'Ce pseudo est déjà pris.';
  end if;
  update profils set pseudo = trim(nouveau) where id = auth.uid();
end $$;

-- Vérifier un lien d'invitation avant l'inscription (ne révèle rien d'autre)
create or replace function public.verifier_invitation(code_invitation text)
returns boolean
language sql stable security definer set search_path = public as $$
  select (not exists (select 1 from profils))
      or exists (
        select 1 from invitations
        where code = code_invitation
          and (expire_le is null or expire_le > now())
          and (max_utilisations is null or utilisations < max_utilisations)
      );
$$;

grant execute on function public.verifier_invitation(text) to anon, authenticated;
grant execute on function public.rejoindre(text, text) to authenticated;
grant execute on function public.changer_pseudo(text) to authenticated;
grant execute on function public.est_admin() to anon, authenticated;
grant execute on function public.est_membre() to anon, authenticated;

-- ---------- Sécurité (Row Level Security) -----------------------------

alter table public.profils     enable row level security;
alter table public.invitations enable row level security;
alter table public.fiches      enable row level security;

-- PROFILS : tout le monde voit les pseudos, seul l'admin change les rôles
drop policy if exists "profils lecture" on public.profils;
create policy "profils lecture" on public.profils for select using (true);

drop policy if exists "profils admin" on public.profils;
create policy "profils admin" on public.profils for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists "profils suppression admin" on public.profils;
create policy "profils suppression admin" on public.profils for delete to authenticated
  using (public.est_admin() and id <> auth.uid());

-- INVITATIONS : admin uniquement
drop policy if exists "invitations admin" on public.invitations;
create policy "invitations admin" on public.invitations for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- FICHES : lecture publique, écriture par les membres
drop policy if exists "fiches lecture" on public.fiches;
create policy "fiches lecture" on public.fiches for select using (true);

drop policy if exists "fiches ajout" on public.fiches;
create policy "fiches ajout" on public.fiches for insert to authenticated
  with check (
    public.est_membre()
    and auteur_id = auth.uid()
    and (categorie <> 'regles' or public.est_admin())   -- seules les règles sont réservées à l'admin
  );

drop policy if exists "fiches modification" on public.fiches;
create policy "fiches modification" on public.fiches for update to authenticated
  using ((auteur_id = auth.uid() and public.est_membre()) or public.est_admin())
  with check ((categorie <> 'regles' or public.est_admin()));

drop policy if exists "fiches suppression" on public.fiches;
create policy "fiches suppression" on public.fiches for delete to authenticated
  using ((auteur_id = auth.uid() and public.est_membre()) or public.est_admin());

-- ---------- Images (Supabase Storage) ---------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "images lecture" on storage.objects;
create policy "images lecture" on storage.objects for select
  using (bucket_id = 'images');

drop policy if exists "images ajout" on storage.objects;
create policy "images ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.est_membre());

drop policy if exists "images suppression" on storage.objects;
create policy "images suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (owner = auth.uid() or public.est_admin()));

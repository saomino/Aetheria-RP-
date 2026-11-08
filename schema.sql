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

-- Moments marquants : un événement écrit une fois, affiché sur la fiche
-- de chaque personnage / lieu concerné.
create table if not exists public.moments (
  id         uuid primary key default gen_random_uuid(),
  texte      text not null check (char_length(trim(texte)) between 1 and 2000),
  quand      text check (char_length(quand) <= 60),       -- "Session 4", "An 812"… (facultatif)
  fiches     uuid[] not null check (cardinality(fiches) between 1 and 30),
  auteur_id  uuid references public.profils(id) on delete set null default auth.uid(),
  cree_le    timestamptz not null default now()
);
create index if not exists moments_fiches_idx on public.moments using gin (fiches);

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

-- MOMENTS : lecture publique, tout membre peut en ajouter,
-- seul l'auteur (ou un admin) peut le supprimer
alter table public.moments enable row level security;

drop policy if exists "moments lecture" on public.moments;
create policy "moments lecture" on public.moments for select using (true);

drop policy if exists "moments ajout" on public.moments;
create policy "moments ajout" on public.moments for insert to authenticated
  with check (public.est_membre() and auteur_id = auth.uid());

drop policy if exists "moments modification" on public.moments;
create policy "moments modification" on public.moments for update to authenticated
  using ((auteur_id = auth.uid() and public.est_membre()) or public.est_admin())
  with check ((auteur_id = auth.uid() and public.est_membre()) or public.est_admin());

drop policy if exists "moments suppression" on public.moments;
create policy "moments suppression" on public.moments for delete to authenticated
  using ((auteur_id = auth.uid() and public.est_membre()) or public.est_admin());

-- ---------- Dés ---------------------------------------------------------
-- Bonus de dés : pour une race (fiche "Peuples & Races") ou un personnage.
-- Tout le monde lance 1d15 + bonus de la race + bonus du perso + bonus du moment.
create table if not exists public.des (
  fiche_id       uuid primary key references public.fiches(id) on delete cascade,
  bonus_attaque  int not null default 0 check (bonus_attaque between -10000 and 1000000),
  bonus_defense  int not null default 0 check (bonus_defense between -10000 and 1000000),
  maj_par        uuid references public.profils(id) on delete set null default auth.uid(),
  maj_le         timestamptz not null default now()
);

alter table public.des enable row level security;

drop policy if exists "des lecture" on public.des;
create policy "des lecture" on public.des for select using (true);

-- Dé d'une race : tout membre peut le régler. Bonus d'un personnage : son auteur ou un admin.
drop policy if exists "des ajout" on public.des;
create policy "des ajout" on public.des for insert to authenticated
  with check (public.est_membre() and (public.est_admin() or exists (
    select 1 from public.fiches f where f.id = fiche_id and (f.categorie = 'peuples' or f.auteur_id = auth.uid()))));

drop policy if exists "des modification" on public.des;
create policy "des modification" on public.des for update to authenticated
  using (public.est_membre() and (public.est_admin() or exists (
    select 1 from public.fiches f where f.id = fiche_id and (f.categorie = 'peuples' or f.auteur_id = auth.uid()))))
  with check (public.est_membre());

-- Historique des lancers : les dés sont tirés PAR LE SERVEUR (impossible de tricher)
create table if not exists public.lancers (
  id         uuid primary key default gen_random_uuid(),
  auteur_id  uuid references public.profils(id) on delete set null default auth.uid(),
  mode       text not null check (mode in ('simple', 'combat')),
  donnees    jsonb not null,
  cree_le    timestamptz not null default now()
);
create index if not exists lancers_date_idx on public.lancers (cree_le desc);

alter table public.lancers enable row level security;
drop policy if exists "lancers lecture" on public.lancers;
create policy "lancers lecture" on public.lancers for select using (true);
drop policy if exists "lancers suppression admin" on public.lancers;
create policy "lancers suppression admin" on public.lancers for delete to authenticated using (public.est_admin());
-- (pas de politique d'ajout : on passe obligatoirement par la fonction lancer_des)

create or replace function public.lancer_des(p_mode text, p_a jsonb, p_d jsonb default null)
returns public.lancers
language plpgsql security definer set search_path = public as $$
declare
  cote_a jsonb; cote_d jsonb; res jsonb; ligne lancers;
  borne int := 1000000;
begin
  if not public.est_membre() then raise exception 'Tu dois être membre pour lancer les dés.'; end if;
  if p_mode not in ('simple', 'combat') then raise exception 'Mode inconnu.'; end if;

  cote_a := jsonb_build_object(
    'nom',         left(coalesce(p_a->>'nom', ''), 80),
    'fiche_id',    p_a->>'fiche_id',
    'race',        left(coalesce(p_a->>'race', ''), 80),
    'sens',        case when p_mode = 'combat' then 'attaque' else coalesce(nullif(p_a->>'sens', ''), 'attaque') end,
    'bonus_race',  greatest(-borne, least(borne, coalesce((p_a->>'bonus_race')::int, 0))),
    'bonus_perso', greatest(-borne, least(borne, coalesce((p_a->>'bonus_perso')::int, 0))),
    'bonus_extra', greatest(-borne, least(borne, coalesce((p_a->>'bonus_extra')::int, 0))),
    'de',          1 + floor(random() * 15)::int);
  cote_a := cote_a || jsonb_build_object('total',
    (cote_a->>'de')::int + (cote_a->>'bonus_race')::int + (cote_a->>'bonus_perso')::int + (cote_a->>'bonus_extra')::int);
  res := jsonb_build_object('a', cote_a);

  if p_mode = 'combat' then
    if p_d is null then raise exception 'Il manque le défenseur.'; end if;
    cote_d := jsonb_build_object(
      'nom',         left(coalesce(p_d->>'nom', ''), 80),
      'fiche_id',    p_d->>'fiche_id',
      'race',        left(coalesce(p_d->>'race', ''), 80),
      'sens',        'defense',
      'bonus_race',  greatest(-borne, least(borne, coalesce((p_d->>'bonus_race')::int, 0))),
      'bonus_perso', greatest(-borne, least(borne, coalesce((p_d->>'bonus_perso')::int, 0))),
      'bonus_extra', greatest(-borne, least(borne, coalesce((p_d->>'bonus_extra')::int, 0))),
      'de',          1 + floor(random() * 15)::int);
    cote_d := cote_d || jsonb_build_object('total',
      (cote_d->>'de')::int + (cote_d->>'bonus_race')::int + (cote_d->>'bonus_perso')::int + (cote_d->>'bonus_extra')::int);
    res := res || jsonb_build_object('d', cote_d,
      'degats', greatest(0, (cote_a->>'total')::int - (cote_d->>'total')::int),
      'gagnant', case when (cote_a->>'total')::int > (cote_d->>'total')::int then 'attaquant'
                      when (cote_a->>'total')::int < (cote_d->>'total')::int then 'defenseur' else 'egalite' end);
  end if;

  insert into lancers (auteur_id, mode, donnees) values (auth.uid(), p_mode, res) returning * into ligne;
  return ligne;
end $$;

grant execute on function public.lancer_des(text, jsonb, jsonb) to authenticated;

drop policy if exists "des suppression" on public.des;
create policy "des suppression" on public.des for delete to authenticated
  using (public.est_admin() or exists (
    select 1 from public.fiches f where f.id = fiche_id and f.auteur_id = auth.uid() and public.est_membre()));

alter table public.des add column if not exists bonus_soutien int not null default 0;
alter table public.des drop constraint if exists des_soutien_borne;
alter table public.des add constraint des_soutien_borne check (bonus_soutien between -10000 and 1000000);

-- Dés des RACES : une ligne par nom de race (tel qu'écrit dans la case
-- « Race / Peuple » des personnages, ou titre d'une fiche de race).
-- "cle" = nom en minuscules sans accents, pour reconnaître "Humain" = "humain".
create table if not exists public.races_des (
  cle            text primary key check (char_length(cle) between 1 and 80),
  nom            text not null check (char_length(nom) between 1 and 80),
  bonus_attaque  int not null default 0 check (bonus_attaque between -10000 and 1000000),
  bonus_defense  int not null default 0 check (bonus_defense between -10000 and 1000000),
  bonus_soutien  int not null default 0 check (bonus_soutien between -10000 and 1000000),
  maj_par        uuid references public.profils(id) on delete set null default auth.uid(),
  maj_le         timestamptz not null default now()
);
alter table public.races_des enable row level security;
drop policy if exists "races_des lecture" on public.races_des;
create policy "races_des lecture" on public.races_des for select using (true);
drop policy if exists "races_des ajout" on public.races_des;
create policy "races_des ajout" on public.races_des for insert to authenticated with check (public.est_membre());
drop policy if exists "races_des modification" on public.races_des;
create policy "races_des modification" on public.races_des for update to authenticated using (public.est_membre()) with check (public.est_membre());
drop policy if exists "races_des suppression" on public.races_des;
create policy "races_des suppression" on public.races_des for delete to authenticated using (public.est_admin());

-- Reprise des dés déjà réglés sur des fiches de race (ancienne version)
insert into public.races_des (cle, nom, bonus_attaque, bonus_defense, bonus_soutien)
select regexp_replace(translate(lower(trim(f.titre)), 'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '\s+', ' ', 'g'),
       trim(f.titre), d.bonus_attaque, d.bonus_defense, d.bonus_soutien
from public.des d join public.fiches f on f.id = d.fiche_id
where f.categorie = 'peuples'
on conflict (cle) do nothing;

-- ---------- Assistant IA ---------------------------------------------
-- Analyses enregistrées (l'IA propose, elle ne modifie jamais les fiches).
-- Écrites uniquement par la fonction "aetheria-ia" (clé serveur).
create table if not exists public.analyses_ia (
  id         uuid primary key default gen_random_uuid(),
  cible      text not null check (cible in ('fiche', 'global')),
  fiche_id   uuid references public.fiches(id) on delete cascade,
  contenu    text not null,
  modele     text,
  auteur_id  uuid references public.profils(id) on delete set null,
  cree_le    timestamptz not null default now()
);
create index if not exists analyses_ia_fiche_idx on public.analyses_ia (fiche_id, cree_le desc);
alter table public.analyses_ia enable row level security;
drop policy if exists "analyses lecture" on public.analyses_ia;
create policy "analyses lecture" on public.analyses_ia for select using (true);
drop policy if exists "analyses suppression admin" on public.analyses_ia;
create policy "analyses suppression admin" on public.analyses_ia for delete to authenticated using (public.est_admin());

-- Compteur d'utilisation par jour (limite anti-abus)
create table if not exists public.ia_usage (
  user_id  uuid not null references public.profils(id) on delete cascade,
  jour     date not null default current_date,
  nb       int not null default 0,
  primary key (user_id, jour)
);
alter table public.ia_usage enable row level security;
drop policy if exists "ia_usage lecture" on public.ia_usage;
create policy "ia_usage lecture" on public.ia_usage for select to authenticated using (user_id = auth.uid() or public.est_admin());

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

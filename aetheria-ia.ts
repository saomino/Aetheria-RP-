// @ts-nocheck
// =====================================================================
//  AETHERIA — assistant IA (fonction Supabase "aetheria-ia")
//  Lit les fiches du wiki et renvoie des analyses / réponses.
//  L'IA ne modifie JAMAIS les fiches : elle propose seulement.
//
//  Réglages (Supabase > Edge Functions > Secrets) :
//    IA_CLE          (obligatoire) la clé API de l'IA choisie
//    IA_FOURNISSEUR  gemini (par défaut) | openai | xai | claude
//    IA_MODELE       facultatif pour gemini, obligatoire pour les autres
//    IA_LIMITE_JOUR  nombre d'utilisations par membre et par jour (20 par défaut)
// =====================================================================

const URL_SB = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FOURNISSEUR = (Deno.env.get("IA_FOURNISSEUR") || "gemini").toLowerCase().trim();
const CLE = (Deno.env.get("IA_CLE") || "").trim();
// Par défaut : Gemini Flash (version complète, gratuite). Plus rapide mais moins fin : IA_MODELE = gemini-flash-lite-latest
const MODELE = (Deno.env.get("IA_MODELE") || (FOURNISSEUR === "gemini" ? "gemini-flash-latest" : "")).trim();
// Modèles de secours si le modèle principal est surchargé (séparés par des virgules)
const SECOURS = (Deno.env.get("IA_MODELES_SECOURS") || (FOURNISSEUR === "gemini" ? "gemini-2.5-flash,gemini-flash-lite-latest" : ""))
  .split(",").map((x) => x.trim()).filter((x) => x && x !== MODELE);
const LIMITE_JOUR = parseInt(Deno.env.get("IA_LIMITE_JOUR") || "20", 10);
const MAX_CARACTERES = parseInt(Deno.env.get("IA_MAX_CARACTERES") || (FOURNISSEUR === "gemini" ? "500000" : "150000"), 10);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reponse = (corps, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });

class ErreurIA extends Error {
  constructor(message, statut = 400) { super(message); this.statut = statut; }
}

/* ---------- Accès à la base (clé serveur) ---------- */
async function db(chemin, options = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${chemin}`, {
    ...options,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const texte = await r.text();
  if (!r.ok) throw new ErreurIA("Base de données : " + texte.slice(0, 300), 500);
  return texte ? JSON.parse(texte) : null;
}

async function utilisateur(req) {
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) throw new ErreurIA("Tu dois être connecté.", 401);
  const r = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jeton}` } });
  if (!r.ok) throw new ErreurIA("Session expirée : reconnecte-toi.", 401);
  const u = await r.json();
  const p = await db(`profils?id=eq.${u.id}&select=id,pseudo,role`);
  if (!p || !p[0] || !["admin", "membre"].includes(p[0].role)) throw new ErreurIA("Ton compte n'a pas accès à l'assistant.", 403);
  return p[0];
}

// Vérifie la limite du jour ; renvoie une fonction qui compte l'utilisation (appelée seulement si l'IA a répondu)
async function verifierLimite(profil) {
  const jour = new Date().toISOString().slice(0, 10);
  const lignes = await db(`ia_usage?user_id=eq.${profil.id}&jour=eq.${jour}&select=nb`);
  const nb = lignes && lignes[0] ? lignes[0].nb : 0;
  const limite = profil.role === "admin" ? Math.max(LIMITE_JOUR * 5, 100) : LIMITE_JOUR;
  if (nb >= limite) throw new ErreurIA(`Limite atteinte : ${limite} utilisations de l'IA par jour. Réessaie demain.`, 429);
  return async () => {
    await db("ia_usage?on_conflict=user_id,jour", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: profil.id, jour, nb: nb + 1 }),
    });
    return limite - nb - 1;
  };
}

/* ---------- Mise en forme des fiches pour l'IA ---------- */
const NOMS_CAT = {
  personnages: "Personnage", monde: "Lieu / Monde", peuples: "Peuple / Race", bestiaire: "Créature", magie: "Magie",
  factions: "Faction", divinites: "Divinité / Croyance", objets: "Objet", histoire: "Événement historique",
  chroniques: "Chronique de partie", regles: "Règle du RP",
};
const nettoyer = (t) =>
  String(t || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[(rouge|orange|jaune|vert|bleu|violet|rose|or|gris|blanc|noir)\]([\s\S]*?)\[\/\1\]/g, "$2")
    .replace(/data:[^)\s]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function ficheTexte(f, complet, maxTexte = 20000) {
  const infos = (f.infos || []).filter((i) => i && i.valeur).map((i) => `${i.cle} : ${i.valeur}`).join(" ; ");
  let t = `### ${f.titre}  [${NOMS_CAT[f.categorie] || f.categorie}]`;
  if (f.annee !== null && f.annee !== undefined) t += `\nAnnée : ${f.annee}`;
  if (f.resume) t += `\nRésumé : ${nettoyer(f.resume)}`;
  if (infos) t += `\nInfos : ${nettoyer(infos)}`;
  if (complet && f.contenu) {
    const c = nettoyer(f.contenu);
    t += `\nTexte :\n${c.length > maxTexte ? c.slice(0, maxTexte) + " […]" : c}`;
  }
  return t;
}

function contexteWiki(fiches, moments, { cibleId = null } = {}) {
  // 1) on essaie de tout mettre en entier ; 2) si c'est trop long, on raccourcit les textes
  const autres = fiches.filter((f) => f.id !== cibleId);
  for (const maxTexte of [20000, 6000, 2000, 600, 0]) {
    const blocs = autres.map((f) => ficheTexte(f, maxTexte > 0, maxTexte));
    let t = `# Le wiki d'Aetheria (${fiches.length} fiches)\n\n` + blocs.join("\n\n");
    if (moments.length) {
      const titre = new Map(fiches.map((f) => [f.id, f.titre]));
      t += "\n\n# Moments marquants\n" + moments.slice(0, 300).map((m) =>
        `- ${m.quand ? m.quand + " : " : ""}${nettoyer(m.texte)} (fiches : ${(m.fiches || []).map((id) => titre.get(id)).filter(Boolean).join(", ")})`).join("\n");
    }
    if (t.length <= MAX_CARACTERES || maxTexte === 0) return t.slice(0, MAX_CARACTERES);
  }
}

const SYSTEME = `Tu es l'archiviste d'Aetheria, un univers de jeu de rôle écrit à plusieurs joueurs. Tu les aides à garder un lore cohérent et à l'enrichir.
Règles :
- Tu ne modifies rien : tu signales et tu proposes. Les joueurs décident.
- Base-toi uniquement sur les fiches fournies. Si une information manque, dis-le au lieu de l'inventer. Quand tu proposes une idée nouvelle, présente-la clairement comme une suggestion.
- Cite toujours les fiches avec leur titre exact entre doubles crochets, par exemple [[Raphaël]].
- Réponds en français, de façon concise et concrète, avec des listes à puces.
- Mise en forme autorisée uniquement : "## " pour les titres de partie, "- " pour les listes, **gras**. Pas de tableau, pas de HTML.
- Sois bienveillant : ce sont des créations de joueurs passionnés.`;

const CONSIGNE_FICHE = (f) => `Analyse la fiche « ${f.titre} » (${NOMS_CAT[f.categorie] || f.categorie}) ci-dessous, en la comparant avec le reste du wiki.
Réponds avec exactement ces quatre parties, dans cet ordre (écris « Rien à signaler. » si une partie est vide) :
## Incohérences
(contradictions dans la fiche elle-même ou avec d'autres fiches : dates, âges, races, lieux, liens familiaux, pouvoirs, chronologie…)
## Suggestions
(idées pour enrichir la fiche, cohérentes avec le monde)
## Petites corrections
(orthographe, formulations, cases d'infos vides ou mal remplies)
## Questions à creuser
(points flous que le joueur pourrait préciser)`;

const CONSIGNE_GLOBALE = `Analyse l'ensemble du wiki d'Aetheria.
Réponds avec exactement ces quatre parties, dans cet ordre (écris « Rien à signaler. » si une partie est vide) :
## Incohérences entre fiches
(chaque point cite les fiches concernées)
## Fiches à créer ou à compléter
(personnages, lieux, races, événements mentionnés mais sans fiche, ou fiches trop vides)
## Idées pour le monde
(pistes d'intrigues ou de liens entre fiches existantes)
## Petites corrections
(format : [[Fiche]] : correction)`;

/* ---------- Appel de l'IA ---------- */
// Coupe un appel trop long
async function fetchLimite(url, options, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  catch (e) { if (e.name === "AbortError") throw Object.assign(new ErreurIA("trop lent", 504), { code: 504 }); throw e; }
  finally { clearTimeout(t); }
}

const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Surcharge / lenteur / limite momentanée : on passe au modèle suivant
const PASSAGER = (e) => [429, 500, 502, 503, 504].includes(e.code) || /overload|high demand|unavailable|try again|exhausted|trop lent/i.test(e.message);

// IA de secours d'une autre marque (facultatif) : IA_SECOURS_FOURNISSEUR, IA_SECOURS_CLE, IA_SECOURS_MODELE
const SECOURS_F = (Deno.env.get("IA_SECOURS_FOURNISSEUR") || "").toLowerCase().trim();
const SECOURS_CLE = (Deno.env.get("IA_SECOURS_CLE") || "").trim();
const SECOURS_MODELE = (Deno.env.get("IA_SECOURS_MODELE") || (SECOURS_F === "gemini" ? "gemini-flash-latest" : "")).trim();
const BUDGET_TOTAL = 110000;   // la fonction Supabase est coupée vers 150 s : on garde de la marge
const BUDGET_ESSAI = 45000;    // un modèle qui ne répond pas en 45 s est abandonné

async function appelerIA(systeme, messages) {
  if (!CLE) throw new ErreurIA("L'IA n'est pas encore configurée : il manque le secret IA_CLE dans Supabase.", 500);
  if (!MODELE) throw new ErreurIA(`Il manque le secret IA_MODELE pour le fournisseur « ${FOURNISSEUR} ».`, 500);
  const essais = [MODELE, ...SECOURS].map((m) => ({ f: FOURNISSEUR, cle: CLE, m }));
  if (SECOURS_F && SECOURS_CLE && SECOURS_MODELE) essais.push({ f: SECOURS_F, cle: SECOURS_CLE, m: SECOURS_MODELE });
  const debut = Date.now();
  let derniere;
  for (const [i, e] of essais.entries()) {
    const reste = BUDGET_TOTAL - (Date.now() - debut);
    if (reste < 8000) break;
    if (i > 0) await attendre(1000);
    try {
      return { texte: await appelerModele(e.f, e.cle, e.m, systeme, messages, Math.min(BUDGET_ESSAI, reste)), modele: `${e.f}/${e.m}` };
    } catch (err) {
      derniere = err;
      console.warn(`${e.f}/${e.m} : ${err.message}`);
      if (!PASSAGER(err)) throw err;
    }
  }
  throw new ErreurIA("L'IA est surchargée en ce moment (trop lente ou trop demandée). Réessaie dans quelques minutes." +
    (SECOURS_CLE ? "" : " Astuce : ajoute une IA de secours (Grok ou ChatGPT) dans les secrets Supabase."), 503);
}

async function appelerModele(fournisseur, cle, modele, systeme, messages, delai) {
  let r, d;
  if (fournisseur === "gemini") {
    const corps = (avecReflexion) => JSON.stringify({
      systemInstruction: { parts: [{ text: systeme }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192, ...(avecReflexion ? { thinkingConfig: { thinkingBudget: 512 } } : {}) },
    });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modele)}:generateContent`;
    const opts = (c) => ({ method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": cle }, body: c });
    r = await fetchLimite(url, opts(corps(true)), delai);
    d = await r.json().catch(() => ({}));
    // certains modèles n'acceptent pas le réglage de réflexion : on réessaie sans
    if (r.status === 400 && /thinking/i.test((d.error && d.error.message) || "")) {
      r = await fetchLimite(url, opts(corps(false)), delai);
      d = await r.json().catch(() => ({}));
    }
    if (!r.ok) throw Object.assign(new ErreurIA(`L'IA (Gemini) a refusé la demande : ${(d.error && d.error.message) || r.status}`, 502), { code: r.status });
    const texte = (((d.candidates || [])[0] || {}).content || { parts: [] }).parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
    if (!texte) throw Object.assign(new ErreurIA("L'IA n'a rien répondu (contenu peut-être bloqué par ses filtres).", 502), { code: 502 });
    return texte;
  }
  if (fournisseur === "claude") {
    r = await fetchLimite("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cle, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: modele, max_tokens: 4096, system: systeme, messages }),
    }, delai);
    d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new ErreurIA(`L'IA (Claude) a refusé la demande : ${(d.error && d.error.message) || r.status}`, 502), { code: r.status });
    return (d.content || []).map((c) => c.text || "").join("");
  }
  const base = fournisseur === "xai" || fournisseur === "grok" ? "https://api.x.ai/v1" : "https://api.openai.com/v1";
  r = await fetchLimite(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
    body: JSON.stringify({ model: modele, messages: [{ role: "system", content: systeme }, ...messages] }),
  }, delai);
  d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new ErreurIA(`L'IA (${fournisseur}) a refusé la demande : ${(d.error && d.error.message) || r.status}`, 502), { code: r.status });
  return ((d.choices || [])[0] || { message: {} }).message.content || "";
}

/* ---------- Point d'entrée ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") throw new ErreurIA("Méthode non autorisée.", 405);
    const profil = await utilisateur(req);
    const corps = await req.json().catch(() => ({}));
    const mode = corps.mode;
    if (!["fiche", "global", "question"].includes(mode)) throw new ErreurIA("Mode inconnu.");

    const [fiches, moments] = await Promise.all([
      db("fiches?select=id,categorie,titre,resume,infos,contenu,annee&order=categorie,titre"),
      db("moments?select=texte,quand,fiches&order=cree_le.desc&limit=300"),
    ]);
    if (!fiches.length) throw new ErreurIA("Le wiki est vide : il n'y a rien à analyser.");

    let messages, cible = null;
    if (mode === "fiche") {
      cible = fiches.find((f) => f.id === corps.fiche_id);
      if (!cible) throw new ErreurIA("Fiche introuvable.", 404);
      const mom = moments.filter((m) => (m.fiches || []).includes(cible.id));
      messages = [{
        role: "user",
        content: `${contexteWiki(fiches, moments, { cibleId: cible.id })}\n\n# FICHE À ANALYSER\n${ficheTexte(cible, true, 60000)}` +
          (mom.length ? `\nMoments marquants de cette fiche :\n${mom.map((m) => "- " + (m.quand ? m.quand + " : " : "") + nettoyer(m.texte)).join("\n")}` : "") +
          `\n\n# CONSIGNE\n${CONSIGNE_FICHE(cible)}`,
      }];
    } else if (mode === "global") {
      messages = [{ role: "user", content: `${contexteWiki(fiches, moments)}\n\n# CONSIGNE\n${CONSIGNE_GLOBALE}` }];
    } else {
      const question = String(corps.question || "").trim().slice(0, 2000);
      if (!question) throw new ErreurIA("Écris une question.");
      const historique = (Array.isArray(corps.historique) ? corps.historique : []).slice(-8)
        .filter((m) => m && ["user", "assistant"].includes(m.role) && m.content)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000) }));
      messages = [
        { role: "user", content: `${contexteWiki(fiches, moments)}\n\n# CONSIGNE\nVoici le wiki. Un joueur va te poser des questions sur le lore ou te demander de l'aide pour écrire. Réponds en t'appuyant sur ces fiches.` },
        { role: "assistant", content: "Compris, j'ai lu tout le wiki. Je t'écoute." },
        ...historique,
        { role: "user", content: question },
      ];
    }

    const compter = await verifierLimite(profil);
    const rep = await appelerIA(SYSTEME, messages);
    const texte = rep.texte.trim();
    const restant = await compter();

    let analyse = null;
    if (mode !== "question") {
      const r = await db("analyses_ia", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ cible: mode, fiche_id: cible ? cible.id : null, contenu: texte, modele: rep.modele, auteur_id: profil.id }),
      });
      analyse = r && r[0];
    }
    return reponse({ texte, analyse, restant, modele: rep.modele });
  } catch (e) {
    console.error(e);
    return reponse({ erreur: e.message || String(e) }, e.statut || 500);
  }
});

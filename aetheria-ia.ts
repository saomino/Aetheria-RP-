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
const SECOURS = (Deno.env.get("IA_MODELES_SECOURS") || (FOURNISSEUR === "gemini" ? "gemini-3.8-flash,gemini-flash-lite-latest" : ""))
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

const CONSIGNE_DES = (max, titres, reperes, deja, paliers, uniques) => `Tu évalues des personnages pour le système de dés d'Aetheria (document « Dés • Bonus raciaux • Expérience »).

FORMULE : résultat d'une caractéristique = 1d15 + BONUS RACIAL + BONUS D'EXPÉRIENCE. Les trois caractéristiques sont calculées séparément :
- attaque (ATT) : force physique, puissance magique offensive, maîtrise des armes, techniques d'attaque, vitesse d'exécution offensive, précision, capacité de pénétration
- defense (DEF) : résistance physique et magique, réflexes défensifs, esquive, endurance, armures, barrières, protection, régénération
- soutien : soins, protection des alliés, renforcement, affaiblissement des adversaires, contrôle, assistance énergétique, enchantements, dissipation, coordination
La vitesse n'est pas une caractéristique : elle compte en ATT quand elle sert à attaquer, en DEF quand elle sert à esquiver ou réagir, en SOUTIEN quand elle sert à rejoindre ou secourir un allié.

1) BONUS RACIAL — choisis la race EXACTE du personnage dans cette liste (attaque/défense/soutien) :
${reperes}
- « démon lié à un péché » si la fiche lie le démon à un péché (colère, orgueil, avarice, envie, luxure, gourmandise, paresse) ; « ange lié à une vertu » si l'ange est lié à une vertu (justice, courage, sagesse, tempérance, charité, espérance, foi).
- Lucifer est traité comme « archange dechu » (ange déchu), JAMAIS comme célesto-démoniaque.
- Cas uniques sans bonus racial générique : ${uniques}. Juthi est l'unique hybride célesto-démoniaque : donne "race":"celesto demoniaque" et évalue SES valeurs individuellement dans "base" d'après sa fiche (elles ne servent de référence pour personne d'autre).
- Race absente de la liste : donne "race":"autre" et propose un bonus racial cohérent dans "base", en la comparant aux races connues et à sa fiche de race dans le wiki.

2) BONUS D'EXPÉRIENCE (0 à ${max} maximum, chaque caractéristique SÉPARÉMENT), selon la maîtrise réelle :
${paliers}
- Un personnage peut être Maître en attaque mais seulement Entraîné en défense.
- AUCUN bonus automatique en fonction de l'âge ou du sexe. Seule la maîtrise réelle décrite dans la fiche compte (entraînement, expérience, capacités, spécialités).
- L'expérience améliore la maîtrise DANS LES LIMITES de la nature et du rang racial : elle ne comble pas l'écart entre les grands paliers de puissance (un humain très expérimenté reste un humain face à un dieu primordial).
- Une victoire possible grâce à une stratégie, un artefact, des alliés ou des circonstances ne change pas les bonus.
- Les exceptions individuelles doivent être justifiées par la fiche et ne deviennent jamais des règles pour toute la race.
- COMPARE avec tous les autres personnages du wiki pour rester cohérent : à maîtrise décrite égale, bonus d'expérience égal. Ne donne pas mécaniquement le même bonus à tout le monde.${deja ? `
- Bonus TOTAUX déjà attribués aux autres personnages (attaque/défense/soutien) — reste cohérent avec eux :
${deja}` : ""}

Une raison = une phrase courte en français qui cite ce qui, dans la fiche, justifie le niveau de maîtrise choisi.
Personnages à évaluer : ${titres.map((t) => "« " + t + " »").join(", ")}.
Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sous cette forme :
[{"titre":"…","race":"clé exacte de la liste, celesto demoniaque ou autre","base":{"attaque":0,"defense":0,"soutien":0},"individuel":{"attaque":0,"defense":0,"soutien":0},"palier":{"attaque":"Débutant","defense":"…","soutien":"…"},"raisons":{"attaque":"…","defense":"…","soutien":"…"},"note":"point de vigilance éventuel (info manquante dans la fiche…) ou vide"}]`;

// Repères de puissance par race envoyés par le site (mots-des.js)
function texteReperes(r) {
  if (!r || typeof r !== "object") return "- humain : 0/0/0 (aucun autre repère fourni)";
  return Object.entries(r).slice(0, 120)
    .filter(([, v]) => Array.isArray(v) && v.length === 3)
    .map(([nom, v]) => `- ${String(nom).slice(0, 40)} : ${v.map((x) => Math.max(0, Math.min(100, parseInt(x, 10) || 0))).join("/")}`)
    .join("\n");
}

function textePaliers(p, max) {
  const l = Array.isArray(p) && p.length ? p : [["Débutant", 0], ["Initié", 1], ["Entraîné", 2], ["Expérimenté", 3], ["Expert", 4], ["Maître", 5]];
  return l.slice(0, 20).map(([nom, v], i) => {
    const fin = l[i + 1] ? l[i + 1][1] - 1 : max;
    return `- ${String(nom).slice(0, 40)} : +${v}${fin > v ? " à +" + fin : ""}`;
  }).join("\n");
}
function cleRaceServeur(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_'’]/g, " ").replace(/\s+/g, " ").trim(); }

function texteDeja(d, cibles) {
  if (!Array.isArray(d)) return "";
  const exclus = new Set(cibles.map((c) => c.titre));
  return d.filter((x) => x && x.titre && !exclus.has(x.titre)).slice(0, 300)
    .map((x) => `- ${String(x.titre).slice(0, 60)} : ${[x.attaque, x.defense, x.soutien].map((n) => Math.max(0, Math.min(100, parseInt(n, 10) || 0))).join("/")}`)
    .join("\n");
}

const CONSIGNE_SCENARIO = (mission, rang, desc, equipe) => `Tu es le maître du jeu de la guilde d'Aetheria. Les joueurs viennent de tirer une mission au hasard.
Mission : « ${mission} »
Difficulté : rang ${rang}${desc ? " — " + desc : ""}
Échelle de la guilde, du plus facile au plus difficile : E, D, C, B, A, S, SS.
${equipe.length ? "Équipe envoyée en mission : " + equipe.map((n) => "[[" + n + "]]").join(", ") + "." : "L'équipe n'est pas encore connue."}

Imagine un scénario de mission prêt à jouer, cohérent avec le wiki (réutilise ses lieux, factions, créatures du bestiaire, peuples, divinités et personnages quand c'est pertinent, et cite-les entre [[doubles crochets]]). Si le wiki ne fournit pas ce qu'il faut, invente des éléments nouveaux mais signale-les comme « à créer ».
Dose le danger selon le rang : plus le rang est élevé, plus les adversaires sont puissants, nombreux ou rusés, et plus les conséquences d'un échec sont graves. Si l'équipe est connue, tiens compte de ses forces et faiblesses décrites dans les fiches, sans rendre la mission impossible ni trop facile pour elle.

Réponds avec exactement ces parties :
## Le contrat
(qui confie la mission, ce qui est demandé officiellement, la récompense proposée selon le rang)
## Ce qui se passe vraiment
(la vérité cachée derrière la mission)
## Lieux
## Adversaires et obstacles
(avec leur niveau de danger)
## Déroulé possible
(3 à 5 étapes clés)
## Rebondissement
## Pistes pour le maître du jeu
(choix moraux, liens avec l'histoire des personnages, suites possibles)
Reste concret et évocateur, sans pavés : des listes courtes.`;

const CONSIGNE_CREER = (c, nomsPris) => {
  const v = (x) => (x && String(x).trim() ? String(x).trim().slice(0, 300) : "au choix (invente ce qui est le plus cohérent avec le wiki)");
  return `Crée la fiche d'un NOUVEAU personnage pour le wiki d'Aetheria, à partir des choix du joueur :
- Race : ${v(c.race)}
- Rôle dans l'histoire : ${v(c.role)}
- Lieu de vie (royaume, ville, région) : ${v(c.lieu)}
- Rang social ou métier : ${v(c.rang)}
- Magie : ${v(c.magie)}
- Faction : ${v(c.faction)}
- Nom imposé : ${v(c.nom)}
- Âge : ${v(c.age)}
- Genre : ${v(c.genre)}
- Idées du joueur : ${v(c.idees)}

Règles :
- RESPECTE strictement chaque choix du joueur. Pour ce qui est « au choix », décide toi-même de façon cohérente avec le wiki.
- Le personnage doit s'intégrer au monde existant SANS rien contredire : réutilise les lieux, factions, peuples, divinités, magies et personnages des fiches quand c'est pertinent, et cite-les entre [[doubles crochets]] avec leur titre exact.
- Respecte ce que le wiki dit de sa race (durée de vie, apparence, capacités, coutumes). Si la race n'a pas de fiche, reste plausible.
- Si un rôle royal ou noble est choisi, vérifie qui règne déjà dans ce lieu d'après le wiki et place le personnage sans créer de contradiction (héritier, cadet, prétendant, souverain d'un autre territoire…).
- « Magie : selon sa race » = décide d'après les capacités de la race. « Aucune magie » = aucun pouvoir magique.
- N'utilise PAS un nom déjà pris : ${nomsPris || "(aucun)"}.
- Ne te contente pas de clichés : donne-lui une vraie personnalité, des contradictions, un objectif, un secret.
- Ne donne pas de chiffres de dés ni de bonus.

Réponds UNIQUEMENT avec du JSON valide, sans texte autour :
{"titre":"Nom du personnage","resume":"une phrase d'accroche (moins de 250 caractères)",
"infos":{"Race / Peuple":"…","Âge":"…","Rôle / Classe":"…","Affiliation":"…","Statut":"Vivant","Lieu d'origine":"…"},
"contenu":"le texte de la fiche en Markdown, avec ces parties : ## Apparence, ## Personnalité, ## Histoire, ## Capacités, ## Relations, ## Objectifs et secrets. Utilise des \\n pour les retours à la ligne. 350 à 700 mots."}`;
};

const CONSIGNE_CORRIGER = (titre, avis) => `Corrige la fiche « ${titre} » ci-dessous.
${avis ? "Voici le dernier avis de l'archiviste sur cette fiche, à prendre en compte :\n" + avis + "\n" : ""}
Ce que tu dois corriger :
- les INCOHÉRENCES avec le reste du wiki (dates, âges, races, lieux, liens familiaux, titres, chronologie) et à l'intérieur de la fiche ;
- l'orthographe, la grammaire, la ponctuation, les répétitions maladroites ;
- les cases d'infos vides ou fausses quand la bonne information figure dans le texte ou dans le wiki.

Ce que tu ne dois PAS faire :
- changer le style, la voix, le ton ou la longueur de la fiche : c'est l'œuvre du joueur, corrige sans réécrire ;
- inventer de nouveaux événements, pouvoirs ou personnages ; supprimer des passages (sauf une contradiction évidente) ;
- toucher aux liens [[…]], aux balises de couleur comme [rouge]…[/rouge], aux images ![](…) et aux titres ## : garde-les exactement à leur place ;
- changer le titre de la fiche.
Quand une incohérence ne peut pas être corrigée sans choisir entre deux versions de l'histoire, NE la corrige PAS : signale-la dans "a_verifier".

Réponds UNIQUEMENT avec du JSON valide, sans texte autour :
{"resume":"…","infos":{"Nom de la case":"valeur", …},"contenu":"le texte complet corrigé en Markdown (\\n pour les retours à la ligne)",
"changements":["une phrase par correction faite, ex : Âge corrigé de 30 à 300 ans pour correspondre à la chronologie"],
"a_verifier":["incohérences laissées telles quelles, que le joueur doit trancher"]}
S'il n'y a rien à corriger, renvoie le texte inchangé et "changements":[].`;

const CONSIGNE_ROUES = (titre, existantes) => `Lis la fiche « ${titre} » et décide si ses pouvoirs, sa magie ou ses objets reposent sur un TIRAGE AU SORT ou sur le HASARD : un jeu de cartes, des dés, une roulette, des runes ou des sorts piochés au hasard, des transformations aléatoires, une malédiction qui frappe au hasard, des effets qui changent à chaque utilisation, etc.
- Si c'est le cas, crée une ou plusieurs ROUES qui reproduisent EXACTEMENT ce tirage tel que la fiche le décrit (ex : un jeu de 54 cartes = 54 cases, une par carte, avec l'effet de chaque carte selon sa famille et sa valeur ; respecte les noms, familles, effets et règles de la fiche). Pour l'effet de chaque case, deux cas :
  1. la fiche explique l'effet (de la case précise, ou par une règle générale comme « plus la carte est haute, plus l'effet est fort ») → reprends-le fidèlement, avec ses mots, et applique la règle à chaque case ;
  2. la fiche NE l'explique PAS → c'est à toi de DÉFINIR un effet précis et crédible, déduit de la fiche : sa magie, son style de combat, sa personnalité, ses limites, sa race, son niveau. L'effet doit rester cohérent avec ce que le personnage sait faire et avec sa puissance (ne le rends ni plus fort ni plus faible que la fiche) ; ne lui donne pas de pouvoir qui contredit la fiche.
- Si rien dans la fiche ne repose sur le hasard, ne crée AUCUNE roue : renvoie "roues":[] et explique pourquoi en une phrase.
${existantes ? "Roues déjà enregistrées pour ce personnage (ne les refais pas, propose seulement ce qui manque) : " + existantes + "\n" : ""}
Chaque case : "nom" très court (20 caractères max, ex : "Roi ♥", "Joker noir"), "effet", "poids" (1 = normal ; mets plus pour une case plus fréquente, ex : 2 ou 3, et garde 1 pour les cas rares si les autres sont plus fréquentes). Entre 2 et 200 cases par roue.
L'"effet" est le plus important : c'est le SEUL texte que le joueur lira quand la case tombe, il doit donc se suffire à lui-même. Écris en 1 à 3 phrases ce qui se passe CONCRÈTEMENT en RP :
- ce que fait le pouvoir (attaque, bouclier, soin, illusion, transformation…), sa forme visible, sa cible (lui, un allié, un ennemi, une zone) ;
- sa force (en reprenant les termes et les paliers de la fiche), sa durée ou sa portée si la fiche en parle, et son prix ou son inconvénient s'il y en a ;
- reprends les noms de techniques, les règles et les exemples EXACTS de la fiche quand ils existent.
INTERDIT : un effet vague ou générique comme « Effet offensif de puissance 5 », « Soutien moyen » ou « Distorsion ». Chaque case doit être différente et compréhensible sans relire la fiche.
Quand la fiche range les cases dans des familles ou des catégories (ex : « Distorsion », « Protection », un élément, une école de magie), N'ÉCRIS JAMAIS le nom de la famille seul : dis ce que fait CONCRÈTEMENT cette carte-là. Remplace aussi les mots flous (« beaucoup », « fort », « puissant », « moyen ») par ce qu'on voit et ce que ça change dans le combat ou la scène.
Exemple de MAUVAIS effet : « Distorsion, utilise beaucoup de magie. »
Exemple de BON effet : « Distorsion : il tord l'espace autour d'un ennemi pendant trois échanges ; ses coups sont déviés et frappent à côté. Le Joker perd l'usage de sa main gauche le temps du sort. »
Réponds UNIQUEMENT avec du JSON valide, sans texte autour :
{"roues":[{"nom":"Nom de la roue (ex : Jeu de 54 cartes)","description":"à quoi elle sert et quand la tourner, règles particulières (ex : une carte tirée est défaussée jusqu'au mélange)","elements":[{"nom":"As ♠","effet":"…","poids":1}]}],
"explication":"une ou deux phrases sur pourquoi ces roues (ou pourquoi aucune), en précisant quels effets viennent de la fiche et lesquels tu as dû définir toi-même"}`;

// Récupère le JSON dans la réponse de l'IA (même entouré de texte ou de ```)
function extraireJSON(t) {
  const m = String(t).match(/```(?:json)?\s*([\s\S]*?)```/);
  const x = m ? m[1] : String(t);
  const i = [x.indexOf("["), x.indexOf("{")].filter((k) => k >= 0).sort((a, b) => a - b)[0];
  const j = Math.max(x.lastIndexOf("]"), x.lastIndexOf("}"));
  if (i === undefined || j < i) throw new ErreurIA("L'IA n'a pas renvoyé de proposition lisible. Réessaie.", 502);
  try { return JSON.parse(x.slice(i, j + 1)); }
  catch (e) { throw new ErreurIA("L'IA n'a pas renvoyé de proposition lisible. Réessaie.", 502); }
}

/* ---------- Appel de l'IA ---------- */
// Coupe un appel trop long
async function fetchLimite(url, options, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  catch (e) { if (e.name === "AbortError") throw Object.assign(new ErreurIA("trop lent", 504), { code: 504 }); throw e; }
  finally { clearTimeout(t); }
}


// IA de secours d'une autre marque (facultatif) : IA_SECOURS_FOURNISSEUR, IA_SECOURS_CLE, IA_SECOURS_MODELE
const SECOURS_F = (Deno.env.get("IA_SECOURS_FOURNISSEUR") || "").toLowerCase().trim();
const SECOURS_CLE = (Deno.env.get("IA_SECOURS_CLE") || "").trim();
const SECOURS_MODELE = (Deno.env.get("IA_SECOURS_MODELE") || (SECOURS_F === "gemini" ? "gemini-flash-latest" : "")).trim();
const BUDGET_TOTAL = 110000;   // la fonction Supabase est coupée vers 150 s : on garde de la marge
const BUDGET_ESSAI = 40000;    // un modèle qui ne répond pas en 40 s est abandonné

async function appelerIA(systeme, messages) {
  if (!CLE) throw new ErreurIA("L'IA n'est pas encore configurée : il manque le secret IA_CLE dans Supabase.", 500);
  if (!MODELE) throw new ErreurIA(`Il manque le secret IA_MODELE pour le fournisseur « ${FOURNISSEUR} ».`, 500);
  // Ordre : modèle principal → IA de secours (autre marque) → autres modèles de la marque principale
  const essais = [{ f: FOURNISSEUR, cle: CLE, m: MODELE }];
  if (SECOURS_F && SECOURS_CLE && SECOURS_MODELE) essais.push({ f: SECOURS_F, cle: SECOURS_CLE, m: SECOURS_MODELE });
  for (const m of SECOURS) essais.push({ f: FOURNISSEUR, cle: CLE, m });
  const debut = Date.now();
  const echecs = [];
  for (const e of essais) {
    const reste = BUDGET_TOTAL - (Date.now() - debut);
    if (reste < 8000) break;
    try {
      return { texte: await appelerModele(e.f, e.cle, e.m, systeme, messages, Math.min(BUDGET_ESSAI, reste)), modele: `${e.f}/${e.m}` };
    } catch (err) {
      // quelle que soit l'erreur (surcharge, lenteur, modèle retiré, clé refusée…) on passe au suivant
      const raison = err.code === 504 ? "trop lent" : err.message.replace(/^L'IA \([^)]*\) a refusé la demande : /, "");
      echecs.push(`${e.m} : ${raison.slice(0, 160)}`);
      console.warn(`${e.f}/${e.m} : ${err.message}`);
    }
  }
  const surcharge = echecs.every((x) => /trop lent|high demand|overload|unavailable|exhausted|try again|429|503/i.test(x));
  throw new ErreurIA((surcharge ? "L'IA est surchargée en ce moment. Réessaie dans quelques minutes." : "Aucune IA n'a pu répondre.") +
    (SECOURS_CLE ? "" : " Astuce : ajoute une IA de secours (ChatGPT ou Grok) dans les secrets Supabase.") +
    "\nDétail : " + echecs.join(" | "), 503);
}

async function appelerModele(fournisseur, cle, modele, systeme, messages, delai) {
  let r, d;
  if (fournisseur === "gemini") {
    const corps = (avecReflexion) => JSON.stringify({
      systemInstruction: { parts: [{ text: systeme }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 16384, ...(avecReflexion ? { thinkingConfig: { thinkingBudget: 512 } } : {}) },
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
      body: JSON.stringify({ model: modele, max_tokens: 8192, system: systeme, messages }),
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

/* ---------- Envoi sur Discord (webhook du salon des dés) ---------- */
const SITE = (Deno.env.get("SITE_URL") || "https://saomino.github.io/Aetheria-RP-/").replace(/\/?$/, "/");
const court = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const sg = (n) => (n >= 0 ? "+ " + n : "− " + Math.abs(n));
const NOMS_SENS = { attaque: "⚔️ attaque", defense: "🛡️ défense", soutien: "💚 soutien" };
function formuleDiscord(c) {
  const p = [`🎲 **${c.de}**`];
  if (c.bonus_race) p.push(`${sg(c.bonus_race)} (${court(c.race || "race", 40)})`);
  if (c.bonus_perso) p.push(`${sg(c.bonus_perso)} (expérience)`);
  if (c.bonus_extra) p.push(`${sg(c.bonus_extra)} (bonus)`);
  return p.join(" ") + ` = **${c.total}**`;
}
const lienFiche = (c) => (c.fiche_id ? `[${court(c.nom, 80)}](${SITE}#/f/${encodeURIComponent(c.fiche_id)})` : court(c.nom || c.race || "Anonyme", 80));

async function envoyerDiscord(profil, corps) {
  // salon des dés : lancers et roues de pouvoirs ; salon des missions : tirages de mission
  const salon = corps.salon === "missions" || corps.salon === "des" ? corps.salon : corps.type === "tirage" ? "missions" : "des";
  const secret = salon === "missions" ? "DISCORD_WEBHOOK_MISSIONS" : "DISCORD_WEBHOOK";
  const url = Deno.env.get(secret) || "";
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url))
    throw new ErreurIA(`Le salon Discord ${salon === "missions" ? "des missions" : "des dés"} n'est pas encore branché : il manque le secret ${secret} dans Supabase.`, 400);
  const lieu = court(corps.lieu, 80);
  const pied = { text: `Tiré sur Aetheria par ${court(profil.pseudo, 40)}${lieu ? " · 📍 " + lieu : ""}` };
  let embed;
  if (corps.type === "lancer") {
    const l = (await db(`lancers?id=eq.${encodeURIComponent(String(corps.lancer_id || ""))}&select=*`))[0];
    if (!l) throw new ErreurIA("Lancer introuvable.", 404);
    if (l.auteur_id !== profil.id && profil.role !== "admin") throw new ErreurIA("Tu ne peux envoyer que tes propres lancers.", 403);
    if (Date.now() - new Date(l.cree_le).getTime() > 30 * 60000) throw new ErreurIA("Ce lancer date de plus de 30 minutes : relance les dés.", 400);
    const d = l.donnees;
    if (l.mode === "combat") {
      const g = d.gagnant;
      embed = {
        title: `⚔️ ${court(d.a.nom || "Attaquant", 60)} attaque ${court(d.d.nom || "Défenseur", 60)}`,
        color: g === "attaquant" ? 0xc9706b : g === "defenseur" ? 0x7fc8f8 : 0xe3b866,
        fields: [
          { name: `⚔️ ${court(d.a.nom || "Attaquant", 80)}`, value: formuleDiscord(d.a) },
          { name: `🛡️ ${court(d.d.nom || "Défenseur", 80)}`, value: formuleDiscord(d.d) },
        ],
        description: g === "attaquant" ? `💥 ${lienFiche(d.a)} **touche** : ${d.degats} dégât${d.degats > 1 ? "s" : ""}`
          : g === "defenseur" ? `🛡️ ${lienFiche(d.d)} **pare l'attaque**` : "⚖️ **Égalité**",
      };
    } else {
      embed = { title: `${NOMS_SENS[d.a.sens] || "🎲"} — ${court(d.a.nom || d.a.race || "Lancer", 80)}`, color: 0xe3b866, description: formuleDiscord(d.a) + (d.a.fiche_id ? `\n${lienFiche(d.a)}` : "") };
    }
    pied.text += " · lancer vérifié ✔";
  } else if (corps.type === "roue") {
    embed = {
      title: `🎡 ${court(corps.roue || "Roue", 80)}${corps.perso ? " — " + court(corps.perso, 60) : ""}`,
      color: 0x6a4c93,
      description: `**${court(corps.nom, 80)}**${corps.effet ? "\n" + court(corps.effet, 1500) : ""}`,
    };
  } else if (corps.type === "tirage") {
    const equipe = (Array.isArray(corps.equipe) ? corps.equipe : []).slice(0, 12).map((n) => court(n, 60)).filter(Boolean);
    embed = {
      title: "🎯 Tirage de mission", color: 0x2f6f6a,
      fields: [
        ...(equipe.length ? [{ name: "👥 Équipe", value: equipe.join(", ") }] : []),
        ...(corps.mission ? [{ name: "📜 Mission", value: court(corps.mission, 300) }] : []),
        ...(corps.difficulte ? [{ name: "⭐ Difficulté", value: `Rang **${court(corps.difficulte, 10)}**${corps.description ? " — " + court(corps.description, 200) : ""}` }] : []),
      ],
      description: corps.scenario ? court(corps.scenario, 3500) : undefined,
    };
  } else if (corps.type === "jeu") {
    embed = { title: court(corps.titre || "Mini-jeu", 250), color: 0xf5d08a, description: court(corps.texte, 3500) || undefined };
  } else throw new ErreurIA("Type d'envoi inconnu.");
  embed.footer = pied;
  embed.timestamp = new Date().toISOString();
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "wait=true", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Aetheria", embeds: [embed], allowed_mentions: { parse: [] } }),
  });
  if (r.status === 404 || r.status === 401) throw new ErreurIA("Discord refuse le webhook : il a peut-être été supprimé. Crée-en un nouveau et remplace " + secret + " dans Supabase.", 502);
  if (r.status === 429) throw new ErreurIA("Discord demande d'attendre quelques secondes avant le prochain envoi.", 429);
  if (!r.ok) throw new ErreurIA("Discord a refusé le message (" + r.status + ").", 502);
  return reponse({ ok: true });
}

/* ---------- Point d'entrée ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") throw new ErreurIA("Méthode non autorisée.", 405);
    const profil = await utilisateur(req);
    const corps = await req.json().catch(() => ({}));
    const mode = corps.mode;
    if (mode === "discord") return await envoyerDiscord(profil, corps);
    if (!["fiche", "global", "question", "des", "scenario", "creer", "corriger", "roues"].includes(mode)) throw new ErreurIA("Mode inconnu.");

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
    } else if (mode === "des") {
      // un ou plusieurs personnages (25 max par appel)
      const ids = (Array.isArray(corps.fiche_ids) ? corps.fiche_ids : [corps.fiche_id]).filter(Boolean).slice(0, 40);
      var cibles = fiches.filter((f) => ids.includes(f.id));
      if (!cibles.length) throw new ErreurIA("Personnage introuvable.", 404);
      var maxDes = Math.max(1, Math.min(50, parseInt(corps.max, 10) || 5));
      messages = [{
        role: "user",
        content: `${contexteWiki(fiches, moments, { cibleId: cibles.length === 1 ? cibles[0].id : null })}` +
          (cibles.length === 1 ? `\n\n# FICHE À ÉVALUER\n${ficheTexte(cibles[0], true, 60000)}` : "") +
          `\n\n# CONSIGNE\n${CONSIGNE_DES(maxDes, cibles.map((f) => f.titre), texteReperes(corps.reperes), texteDeja(corps.deja, cibles), textePaliers(corps.paliers, maxDes), (Array.isArray(corps.uniques) && corps.uniques.length ? corps.uniques.slice(0, 10).map((u) => String(u).slice(0, 40)).join(", ") : "celesto demoniaque"))}`,
      }];
    } else if (mode === "corriger") {
      cible = fiches.find((x) => x.id === corps.fiche_id);
      if (!cible) throw new ErreurIA("Fiche introuvable.", 404);
      const av = await db(`analyses_ia?fiche_id=eq.${cible.id}&select=contenu&order=cree_le.desc&limit=1`).catch(() => []);
      const brut = { titre: cible.titre, resume: cible.resume || "", infos: Object.fromEntries((cible.infos || []).map((i) => [i.cle, i.valeur || ""])), contenu: String(cible.contenu || "").slice(0, 60000) };
      messages = [{
        role: "user",
        content: `${contexteWiki(fiches, moments, { cibleId: cible.id })}\n\n# FICHE À CORRIGER (texte exact)\n${JSON.stringify(brut)}\n\n# CONSIGNE\n${CONSIGNE_CORRIGER(cible.titre, av && av[0] ? String(av[0].contenu).slice(0, 6000) : "")}`,
      }];
    } else if (mode === "roues") {
      cible = fiches.find((x) => x.id === corps.fiche_id);
      if (!cible) throw new ErreurIA("Fiche introuvable.", 404);
      const ex = await db(`roues_perso?fiche_id=eq.${cible.id}&select=nom`).catch(() => []);
      messages = [{
        role: "user",
        content: `${contexteWiki(fiches, moments, { cibleId: cible.id })}\n\n# FICHE DU PERSONNAGE\n${ficheTexte(cible, true, 60000)}\n\n# CONSIGNE\n${CONSIGNE_ROUES(cible.titre, (ex || []).map((r) => r.nom).join(", "))}`,
      }];
    } else if (mode === "creer") {
      const choix = corps.choix && typeof corps.choix === "object" ? corps.choix : {};
      if (!String(choix.race || "").trim()) throw new ErreurIA("Choisis au moins une race.");
      const nomsPris = fiches.filter((x) => x.categorie === "personnages").map((x) => x.titre).slice(0, 400).join(", ");
      messages = [{ role: "user", content: `${contexteWiki(fiches, moments)}\n\n# CONSIGNE\n${CONSIGNE_CREER(choix, nomsPris)}` }];
    } else if (mode === "scenario") {
      const mission = String(corps.mission || "").trim().slice(0, 300);
      const rang = String(corps.difficulte || "").trim().slice(0, 20);
      if (!mission || !rang) throw new ErreurIA("Il faut une mission et une difficulté.");
      const equipe = (Array.isArray(corps.personnages) ? corps.personnages : []).slice(0, 12).map((n) => String(n).slice(0, 80));
      messages = [{ role: "user", content: `${contexteWiki(fiches, moments)}\n\n# CONSIGNE\n${CONSIGNE_SCENARIO(mission, rang, String(corps.description || "").slice(0, 200), equipe)}` }];
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

    if (mode === "corriger") {
      const o = extraireJSON(texte);
      const c = Array.isArray(o) ? o[0] : o;
      if (!c || typeof c.contenu !== "string") throw new ErreurIA("L'IA n'a pas renvoyé de version corrigée lisible. Réessaie.", 502);
      const infos = {};
      for (const [k, v2] of Object.entries(c.infos || {})) if (v2 !== null && v2 !== undefined) infos[String(k).slice(0, 40)] = String(v2).slice(0, 150);
      const liste = (x) => (Array.isArray(x) ? x : []).map((y) => String(y).slice(0, 300)).filter(Boolean).slice(0, 40);
      return reponse({
        correction: { resume: String(c.resume ?? cible.resume ?? "").slice(0, 400), infos, contenu: c.contenu.replace(/\\n/g, "\n").slice(0, 100000),
          changements: liste(c.changements), a_verifier: liste(c.a_verifier) },
        restant, modele: rep.modele,
      });
    }

    if (mode === "roues") {
      const o = extraireJSON(texte);
      const brut = Array.isArray(o) ? { roues: o } : (o || {});
      const roues = (Array.isArray(brut.roues) ? brut.roues : []).slice(0, 5).map((r) => ({
        nom: String(r && r.nom || "Roue").trim().slice(0, 80) || "Roue",
        description: String(r && r.description || "").slice(0, 1000),
        elements: (Array.isArray(r && r.elements) ? r.elements : []).slice(0, 200).map((e) => {
          const x = typeof e === "string" ? { nom: e } : (e || {});
          return { nom: String(x.nom || "").trim().slice(0, 40), effet: String(x.effet || "").slice(0, 700), poids: Math.max(1, Math.min(20, Math.round(Number(x.poids) || 1))) };
        }).filter((e) => e.nom),
      })).filter((r) => r.elements.length >= 2);
      return reponse({ roues, explication: String(brut.explication || "").slice(0, 600), restant, modele: rep.modele });
    }

    if (mode === "creer") {
      const o = extraireJSON(texte);
      const fiche = Array.isArray(o) ? o[0] : o;
      if (!fiche || !fiche.titre) throw new ErreurIA("L'IA n'a pas renvoyé de fiche lisible. Réessaie.", 502);
      const infos = {};
      for (const [k, v2] of Object.entries(fiche.infos || {})) if (v2 !== null && v2 !== undefined && String(v2).trim()) infos[String(k).slice(0, 40)] = String(v2).slice(0, 150);
      return reponse({
        fiche: { titre: String(fiche.titre).slice(0, 120), resume: String(fiche.resume || "").slice(0, 400), infos, contenu: String(fiche.contenu || "").replace(/\\n/g, "\n").slice(0, 30000) },
        restant, modele: rep.modele,
      });
    }

    if (mode === "des") {
      let liste = extraireJSON(texte);
      if (!Array.isArray(liste)) liste = [liste];
      const borneInd = (n) => Math.max(0, Math.min(maxDes, Math.round(Number(n) || 0)));
      const borneBase = (n) => Math.max(0, Math.min(60, Math.round(Number(n) || 0)));
      const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      const table = {};
      for (const [k, v] of Object.entries(corps.reperes || {})) if (Array.isArray(v) && v.length === 3) table[cleRaceServeur(k)] = v.map((x) => parseInt(x, 10) || 0);
      const T = ["attaque", "defense", "soutien"];
      const lire = (o, t) => (o ? o[t] ?? (t === "defense" ? o["défense"] : undefined) : undefined);
      const propositions = cibles.map((f, i) => {
        const p = liste.find((x) => norm(x.titre) === norm(f.titre)) || (cibles.length === 1 ? liste[0] : liste[i]) || {};
        const cle = cleRaceServeur(p.race);
        const officielle = table[cle];
        const base = {}, individuel = {}, total = {}, palier = {}, raisons = {};
        T.forEach((t, k) => {
          base[t] = officielle ? officielle[k] : borneBase(lire(p.base, t));
          individuel[t] = borneInd(lire(p.individuel, t));
          total[t] = Math.max(0, base[t] + individuel[t]);
          palier[t] = String(lire(p.palier, t) || "").slice(0, 40);
          raisons[t] = String(lire(p.raisons, t) || "").slice(0, 300);
        });
        const unique = (Array.isArray(corps.uniques) ? corps.uniques : ["celesto demoniaque"]).map(cleRaceServeur).includes(cle);
        return { fiche_id: f.id, titre: f.titre, race: officielle ? cle : unique ? cle + " (cas unique)" : (p.race ? String(p.race).slice(0, 60) + " (hors barème)" : "race inconnue"),
          base, individuel, palier, raisons, note: String(p.note || "").slice(0, 300), ...total };
      });
      return reponse({ propositions, restant, modele: rep.modele });
    }

    let analyse = null;
    if (mode !== "question" && mode !== "scenario") {
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

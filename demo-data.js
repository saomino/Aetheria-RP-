/* Contenu d'exemple — utilisé seulement en MODE DÉMO.
   Sur le vrai site (Supabase), on part d'une page blanche. */
window.AETHERIA_DEMO_DATA = function () {
  const now = Date.now();
  const d = (j) => new Date(now - j * 86400000).toISOString();
  const A = "admin-demo", M = "membre-demo";
  const f = (id, categorie, titre, resume, infos, contenu, extra = {}) => ({
    id, categorie, titre, resume, infos: Object.entries(infos).map(([cle, valeur]) => ({ cle, valeur })),
    contenu, image_url: null, annee: null, auteur_id: A, cree_le: d(10), modifie_le: d(2), ...extra,
  });

  // Illustrations d'exemple (dessins simples) pour montrer la galerie
  const illu = (c1, c2, texte) => "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="300" height="400" fill="url(#g)"/><circle cx="150" cy="120" r="42" fill="#0d1024" opacity=".55"/><path d="M80 380 L105 200 Q150 170 195 200 L220 380 Z" fill="#0d1024" opacity=".55"/><text x="150" y="40" text-anchor="middle" font-family="Georgia" font-size="22" fill="#fff" opacity=".85">${texte}</text></svg>`);

  return {
    connecte: A,
    profils: [
      { id: A, pseudo: "Toi (admin)", role: "admin", cree_le: d(30) },
      { id: M, pseudo: "Lysandre", role: "membre", cree_le: d(12) },
    ],
    invitations: [
      { code: "demo-invitation", note: "Exemple de lien", max_utilisations: 5, utilisations: 1, expire_le: null, cree_le: d(12) },
    ],
    fiches: [
      f("ex-1", "monde", "Les Îles d'Azur", "Archipel d'îles flottantes suspendues au-dessus de la Brume, cœur du monde connu.",
        { "Type de lieu": "Archipel flottant", "Région": "Haut-Ciel", "Dirigeant": "Conseil des Vents", "Climat": "Venteux, tempéré", "Danger": "Modéré" },
        "## Géographie\nUne centaine d'îles dérivent lentement au-dessus de la **Brume**, une mer de nuages que nul n'a jamais traversée vivant.\n\nLes îles sont reliées par des ponts de cordes et des navires à voiles d'éther, pilotés par l'[[Ordre des Veilleurs]].\n\n## Lieux notables\n- **Port-Céleste**, la capitale marchande\n- **La Flèche d'Opale**, siège de l'enseignement de la [[Magie de l'Éther]]\n- Les ruines d'**Ancre-Basse**, abandonnées depuis [[La Chute des Ancres]]"),
      f("ex-2", "personnages", "Kaelen Ventombre", "Navigateur exilé, ancien capitaine de l'Ordre des Veilleurs.",
        { "Joueur": "Lysandre", "Race / Peuple": "Sylphe", "Âge": "34 ans", "Rôle / Classe": "Navigateur, lame", "Affiliation": "Ex-Ordre des Veilleurs", "Statut": "Vivant", "Lieu d'origine": "Les Îles d'Azur" },
        "## Apparence\nGrand, maigre, une cicatrice argentée lui barre la gorge. Ses yeux changent de couleur avec le vent.\n\n## Histoire\nKaelen a servi dix ans dans l'[[Ordre des Veilleurs]] avant d'être chassé pour avoir refusé d'abandonner un équipage tombé dans la Brume.\n\n> « Le ciel ne pardonne pas. Moi non plus. »\n\n## Équipement\n- Le [[Compas de Nérith]]\n- Une rapière en verre de foudre",
        { auteur_id: M, galerie: [
          { url: illu("#3b5b8c", "#141a3a", "Tenue de capitaine"), legende: "Tenue de capitaine (avant l'exil)" },
          { url: illu("#5c4a7a", "#1a1430", "Tenue de voyage"), legende: "Tenue de voyage" },
          { url: illu("#8c6a3b", "#2a1a10", "Tenue de bal"), legende: "Déguisé pour le bal de Port-Céleste" },
        ] }),
      f("ex-3", "peuples", "Sylphes", "Peuple aérien aux os creux, nés dans les hauteurs des Îles d'Azur.",
        { "Espérance de vie": "~150 ans", "Taille moyenne": "1,90 m", "Langue": "Le Souffle", "Territoires": "Les Îles d'Azur", "Affinité magique": "Éther, vent" },
        "Les Sylphes sentent les courants d'éther comme d'autres sentent la chaleur. Ils sont souvent pilotes, messagers ou mages.\n\n## Coutumes\nChaque Sylphe reçoit à sa naissance un *nom de vent*, qu'il ne révèle qu'à ses proches."),
      f("ex-4", "bestiaire", "Raie des Brumes", "Immense prédateur planant qui chasse à la lisière de la Brume.",
        { "Habitat": "Lisière de la Brume", "Taille": "Jusqu'à 30 m d'envergure", "Dangerosité": "★★★★☆", "Comportement": "Chasse en silence, la nuit", "Faiblesses": "Lumière vive, sel", "Rareté": "Peu commune" },
        "Une Raie des Brumes peut emporter un petit navire entier. Les marins de Port-Céleste accrochent des lanternes de sel à leurs coques pour l'éloigner.\n\nSa peau est très recherchée pour fabriquer des voiles d'éther."),
      f("ex-5", "magie", "Magie de l'Éther", "La source principale de magie d'Aetheria : l'énergie qui maintient les îles dans le ciel.",
        { "École": "Fondamentale", "Source": "Courants d'éther", "Coût": "Fatigue, givre sur la peau", "Effets secondaires": "Dépendance à haute dose" },
        "## Principe\nL'éther circule entre les îles comme un fleuve invisible. Les mages le canalisent par le souffle et le geste.\n\n## Les trois Cercles\n1. **Cercle du Souffle** — déplacer l'air, léviter de petits objets\n2. **Cercle de l'Ancre** — stabiliser ou faire dériver une masse\n3. **Cercle de l'Orage** — magie offensive, interdite hors de l'Ordre\n\n---\nVoir aussi : [[Sylphes]], [[Compas de Nérith]]."),
      f("ex-6", "factions", "Ordre des Veilleurs", "Ordre militaire qui garde les routes célestes et surveille la Brume.",
        { "Chef": "Haute-Veilleuse Maëra", "Siège": "Port-Céleste", "Membres": "~2 000", "Objectifs": "Protéger les îles de ce qui monte de la Brume", "Ennemis": "Les Plongeurs" },
        "Fondé après [[La Chute des Ancres]], l'Ordre est respecté et craint. Ses membres portent un manteau gris et un œil d'argent brodé."),
      f("ex-7", "divinites", "Nérith, la Dame des Vents", "Déesse des voyageurs, des vents et des choses perdues.",
        { "Domaine": "Vents, voyages, objets perdus", "Symbole": "Une plume dans un cercle", "Alignement": "Neutre", "Fidèles": "Marins, Sylphes", "Lieux saints": "Le Phare-Sanctuaire" },
        "On dit que Nérith a soufflé les îles hors de la Brume au commencement du monde. Les marins jettent une plume par-dessus bord avant chaque traversée."),
      f("ex-8", "objets", "Compas de Nérith", "Compas d'argent dont l'aiguille montre toujours ce que son porteur a perdu.",
        { "Type": "Relique", "Rareté": "Unique", "Propriétaire actuel": "Kaelen Ventombre", "Pouvoirs": "Indique la direction d'une chose perdue", "Origine": "Inconnue" },
        "L'aiguille ne pointe jamais le nord. Elle pointe ce qui manque au cœur de celui qui le tient — ce qui n'est pas toujours un objet."),
      f("ex-9", "histoire", "La Chute des Ancres", "Effondrement de plusieurs îles dans la Brume, il y a deux siècles.",
        { "Ère": "Âge des Ancres", "Lieu": "Ancre-Basse", "Acteurs principaux": "Les mages du Cercle de l'Ancre", "Conséquences": "Création de l'Ordre des Veilleurs" },
        "En une seule nuit, sept îles ont cessé de flotter. Personne ne sait ce qui a coupé les courants d'éther.\n\nC'est après cette catastrophe qu'est né l'[[Ordre des Veilleurs]].", { annee: 812 }),
      f("ex-10", "histoire", "Fondation de Port-Céleste", "Les premières familles s'installent sur la plus grande île d'Azur.",
        { "Ère": "Âge des Voiles", "Lieu": "Les Îles d'Azur" }, "Le début de l'histoire écrite d'Aetheria.", { annee: 1 }),
      f("ex-11", "chroniques", "Session 1 — Le navire fantôme", "L'équipage découvre un navire vide dérivant à la lisière de la Brume.",
        { "Date de la partie": "12 octobre", "Participants": "Lysandre, Toi (admin)", "Lieu": "Lisière de la Brume", "Arc / Campagne": "Les Voiles Grises" },
        "Kaelen et son équipage abordent un navire sans personne à bord. Le journal de bord s'arrête au milieu d'une phrase…\n\nUne [[Raie des Brumes]] les a pris en chasse au retour.", { auteur_id: M }),
      f("ex-12", "regles", "Règlement du serveur", "Les règles de base pour jouer ensemble sur Aetheria.",
        {}, "## Respect\n- Pas de harcèlement, ni en RP ni hors RP.\n- On sépare toujours le personnage du joueur.\n\n## Jeu\n1. Pas de *powergaming* : on laisse les autres réagir.\n2. Un personnage ne sait que ce qu'il a vu ou appris en jeu.\n3. Toute fiche de personnage doit être publiée ici avant de jouer.\n\n## Le site\nChaque joueur peut créer et modifier **ses** fiches. Pour lier une autre fiche, écris son titre entre doubles crochets : `[[Ordre des Veilleurs]]`."),
    ],
  };
};

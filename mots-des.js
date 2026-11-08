/* =====================================================================
   AETHERIA — analyse des fiches pour les dés
   Le site lit la fiche d'un personnage et cherche ces mots.
   Plus il en trouve (surtout dans le résumé et les cases d'infos),
   plus le bonus de fiche est élevé, jusqu'à BONUS_MAX.

   Tu peux ajouter ou retirer des mots : écris-les en minuscules,
   sans accents. Un mot trouve aussi ses variantes qui commencent pareil
   ("soign" trouve soigner, soigneur, soigne…).
   ===================================================================== */

window.AETHERIA_DES = {
  DE: 15,            // tout le monde lance 1d15
  BONUS_MAX: 30,       // bonus maximum d'un personnage (attaque, défense ou soutien)
  BONUS_PERSO_MAX: 10, // estimation par mots-clés : la fiche ajoute au plus +10 au niveau de sa race
  POINTS_POUR_MAX: 18, // nombre de "points" de mots-clés pour atteindre ce +10

  /* NIVEAU DE PUISSANCE de chaque race (attaque, défense, soutien), sur 30,
     pour un membre ORDINAIRE de cette race. Sert de repère à l'estimation
     automatique ET à l'IA : un individu exceptionnel peut s'en écarter d'environ ±10.
     Le nom est cherché dans la race écrite par le joueur ("Haut-elfe" trouve "haut elfe",
     "Archange déchu" trouve "archange"). Le nom le plus long gagne. */
  RACES_PROPOSEES: {
    "humain":       [0, 0, 0],
    "dieu":         [30, 30, 30],
    "deesse":       [30, 30, 30],
    "divinite":     [30, 30, 30],
    "titan":        [30, 30, 12],
    "demi dieu":    [18, 15, 15],
    "demi deesse":  [18, 15, 15],
    "seraphin":     [27, 24, 27],
    "archange":     [22, 18, 22],
    "ange":         [15, 12, 18],
    "nephilim":     [14, 10, 10],
    "dechu":        [18, 14, 6],
    "archidemon":   [26, 20, 4],
    "demon":        [20, 14, 3],
    "diable":       [20, 14, 3],
    "succube":      [12, 8, 6],
    "incube":       [12, 8, 6],
    "dragon":       [24, 22, 6],
    "phenix":       [12, 9, 18],
    "liche":        [16, 14, 2],
    "vampire":      [9, 8, 2],
    "loup garou":   [10, 8, 2],
    "lycan":        [10, 8, 2],
    "oni":          [12, 9, 2],
    "kitsune":      [8, 6, 8],
    "yokai":        [8, 6, 4],
    "geant":        [14, 12, 0],
    "troll":        [9, 10, 0],
    "golem":        [6, 16, 0],
    "orc":          [8, 4, 0],
    "ogre":         [10, 8, 0],
    "haut elfe":    [8, 6, 9],
    "elfe noir":    [8, 4, 3],
    "elfe":         [4, 4, 6],
    "nain":         [4, 9, 2],
    "sirene":       [4, 3, 8],
    "nymphe":       [2, 3, 10],
    "dryade":       [2, 4, 12],
    "fee":          [2, 3, 10],
    "centaure":     [6, 4, 2],
    "spectre":      [6, 10, 2],
    "fantome":      [4, 10, 2],
    "zombie":       [3, 4, 0],
    "gobelin":      [2, 2, 0],
    "hybride":      [4, 4, 3],
    "metamorphe":   [6, 6, 2],
    "sorcier":      [6, 3, 6],
    "sorciere":     [6, 3, 6],
  },

  TYPES: {
    attaque: {
      nom: "Attaque", icone: "⚔️",
      mots: [
        "attaqu", "combat", "guerri", "guerre", "epee", "lame", "arme", "hache", "lance", "arc ", "archer", "fleche",
        "frapp", "tuer", "tue ", "meurtr", "assassin", "chass", "predat", "destruct", "detrui", "aneanti", "ravag",
        "feu", "flamm", "brasier", "foudre", "eclair", "tempete", "explos", "rage", "fureur", "colere", "berserk",
        "carnage", "sang", "bourreau", "vengean", "chatiment", "punir", "offensi", "soldat", "chevalier", "mercenaire",
        "griffe", "croc", "venin", "poison", "dechir", "massacr", "conquer", "domin", "terreur", "mort", "faucheu",
      ],
    },
    defense: {
      nom: "Défense", icone: "🛡️",
      mots: [
        "defens", "defend", "bouclier", "armure", "cuirasse", "carapace", "ecaille", "protect", "proteg", "gardien",
        "garde", "rempart", "barriere", "muraille", "forteresse", "sentinelle", "veilleu", "paladin", "egide",
        "resist", "endurant", "endurance", "robuste", "invulnerab", "inebranlab", "impenetrab", "solide", "parer",
        "parade", "esquiv", "agile", "agilite", "vigilan", "prudent", "bastion", "abri", "sanctuaire", "repouss",
      ],
    },
    soutien: {
      nom: "Soutien", icone: "💚",
      mots: [
        "guerison", "guerir", "guerisseu", "soin", "soign", "medecin", "remede", "sante", "regener", "resurrect",
        "ressusc", "benedict", "beni", "purif", "sacre", "saint", "divin", "lumiere", "espoir", "aide", "aider",
        "soutien", "soutenir", "renfort", "inspir", "encourag", "harmonie", "paix", "compassion", "bienveill",
        "pretre", "pretresse", "druide", "barde", "chant", "priere", "apais", "reconfort", "miracle", "grace",
        "alchimi", "potion", "herbe", "vie ", "sauver", "salut",
      ],
    },
  },
};

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
  BONUS_MAX: 30,     // bonus maximum d'un personnage
  POINTS_POUR_MAX: 30, // nombre de "points" de mots-clés pour atteindre le maximum

  /* Dés PROPOSÉS pour les races (attaque, défense, soutien).
     Ce sont juste des suggestions : on peut toujours les changer dans l'onglet 🎲 Dés.
     Le nom est cherché dans la race écrite par le joueur ("Haut-elfe" trouve "haut elfe",
     "Archange déchu" trouve "archange"). Le nom le plus long gagne. */
  RACES_PROPOSEES: {
    "humain":       [0, 0, 0],
    "dieu":         [25, 25, 25],
    "deesse":       [25, 25, 25],
    "divinite":     [25, 25, 25],
    "titan":        [22, 22, 8],
    "demi dieu":    [12, 10, 10],
    "demi deesse":  [12, 10, 10],
    "seraphin":     [18, 16, 18],
    "archange":     [15, 12, 15],
    "ange":         [10, 8, 12],
    "nephilim":     [9, 7, 7],
    "dechu":        [12, 9, 4],
    "archidemon":   [17, 13, 3],
    "demon":        [13, 9, 2],
    "diable":       [13, 9, 2],
    "succube":      [8, 5, 4],
    "incube":       [8, 5, 4],
    "dragon":       [16, 15, 4],
    "phenix":       [8, 6, 12],
    "liche":        [11, 9, 1],
    "vampire":      [6, 5, 1],
    "loup garou":   [7, 5, 1],
    "lycan":        [7, 5, 1],
    "oni":          [8, 6, 1],
    "kitsune":      [5, 4, 5],
    "yokai":        [5, 4, 3],
    "geant":        [9, 8, 0],
    "troll":        [6, 7, 0],
    "golem":        [4, 11, 0],
    "orc":          [5, 3, 0],
    "ogre":         [7, 5, 0],
    "haut elfe":    [5, 4, 6],
    "elfe noir":    [5, 3, 2],
    "elfe":         [3, 3, 4],
    "nain":         [3, 6, 1],
    "sirene":       [3, 2, 5],
    "nymphe":       [1, 2, 7],
    "dryade":       [1, 3, 8],
    "fee":          [1, 2, 7],
    "centaure":     [4, 3, 1],
    "spectre":      [4, 7, 1],
    "fantome":      [3, 7, 1],
    "zombie":       [2, 3, 0],
    "gobelin":      [1, 1, 0],
    "hybride":      [3, 3, 2],
    "metamorphe":   [4, 4, 1],
    "sorcier":      [4, 2, 4],
    "sorciere":     [4, 2, 4],
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

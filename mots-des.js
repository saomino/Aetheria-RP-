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
  BONUS_MAX: 40,       // bonus total maximum (racial + expérience), garde-fou
  BONUS_PERSO_MAX: 5,  // bonus d'expérience maximum (« Maître »)
  POINTS_POUR_MAX: 18, // nombre de "points" de mots-clés pour atteindre ce maximum

  /* BONUS RACIAUX (document « Dés • Bonus raciaux • Expérience ») : [attaque, défense, soutien].
     Tous lancent 1d15 + bonus racial + bonus d'expérience, pour chaque caractéristique séparément.
     Le nom est cherché dans la case « Race / Peuple » de la fiche (sans accents ni majuscules).
     Une race absente de cette liste : l'IA déduit son bonus à partir de sa fiche de race. */
  RACES_PROPOSEES: {
    "humain":                [0, 0, 0],
    "hybride":               [2, 1, 1],
    "hybride humain bete":   [3, 2, 1],
    "sirene":                [2, 2, 4],
    "elfe aile":             [2, 2, 3],
    "elfe noir":             [4, 2, 1],
    "oni":                   [5, 5, 1],
    "vampire":               [4, 5, 2],
    "demon":                 [6, 5, 3],
    "demon lie a un peche":  [9, 8, 6],
    "ange":                  [4, 5, 6],
    "ange lie a une vertu":  [7, 8, 9],
    "archange":              [12, 12, 13],
    "archange dechu":        [13, 12, 10],
    "dieu primordial":       [25, 25, 25],
  },
  // Cas uniques : pas de bonus racial générique, valeurs individuelles (Juthi)
  CAS_UNIQUES: ["celesto demoniaque"],
  // Mots qui transforment "démon" en "démon lié à un péché" et "ange" en "ange lié à une vertu"
  PECHES: ["peche", "colere", "orgueil", "avarice", "envie", "luxure", "gourmandise", "paresse"],
  VERTUS: ["vertu", "justice", "courage", "sagesse", "temperance", "charite", "esperance", "foi"],
  // Autres façons d'écrire une race → nom officiel
  ALIAS_RACES: {
    "humain bete": "hybride humain bete", "homme bete": "hybride humain bete", "hybride bete": "hybride humain bete",
    "ange dechu": "archange dechu", "dechu": "archange dechu",
    "celeste demoniaque": "celesto demoniaque", "dieu": "dieu primordial", "divinite primordiale": "dieu primordial",
  },

  /* Bonus d'expérience (par caractéristique, indépendamment) : +5 maximum */
  PALIERS: [
    ["Débutant", 0], ["Initié", 1], ["Entraîné", 2], ["Expérimenté", 3], ["Expert", 4], ["Maître", 5],
  ],

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

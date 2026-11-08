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
  BONUS_MAX: 40,       // bonus total maximum (base raciale + individuel), garde-fou
  BONUS_PERSO_MAX: 10, // bonus individuel maximum ("Hors norme" : +8 à +10)
  POINTS_POUR_MAX: 18, // nombre de "points" de mots-clés pour atteindre ce +10

  /* BASE RACIALE OFFICIELLE (document « Système racial ») : [attaque, défense, soutien]
     pour un individu adulte de maîtrise standard. Tous lancent 1d15 + base + bonus individuel.
     Le nom est cherché dans la case « Race / Peuple » de la fiche (sans accents ni majuscules).
     Une race absente de cette liste : l'IA déduit sa base à partir de sa fiche de race. */
  RACES_PROPOSEES: {
    "humain":                [2, 2, 3],
    "hybride":               [4, 4, 5],
    "hybride humain bete":   [7, 6, 4],
    "sirene":                [6, 7, 9],
    "elfe aile":             [5, 5, 8],
    "elfe noir":             [8, 6, 4],
    "oni":                   [11, 10, 5],
    "vampire":               [8, 9, 7],
    "demon":                 [10, 9, 6],
    "demon lie a un peche":  [13, 11, 10],
    "ange":                  [7, 9, 11],
    "ange lie a une vertu":  [11, 13, 14],
    "archange":              [15, 15, 16],
    "archange dechu":        [17, 15, 13],
    "celesto demoniaque":    [18, 17, 18],
    "dieu primordial":       [22, 22, 22],
  },
  // Mots qui transforment "démon" en "démon lié à un péché" et "ange" en "ange lié à une vertu"
  PECHES: ["peche", "colere", "orgueil", "avarice", "envie", "luxure", "gourmandise", "paresse"],
  VERTUS: ["vertu", "justice", "courage", "sagesse", "temperance", "charite", "esperance", "foi"],
  // Autres façons d'écrire une race → nom officiel
  ALIAS_RACES: {
    "humain bete": "hybride humain bete", "homme bete": "hybride humain bete", "hybride bete": "hybride humain bete",
    "celeste demoniaque": "celesto demoniaque", "dechu": "archange dechu", "dieu": "dieu primordial", "divinite primordiale": "dieu primordial",
  },

  /* Barème de progression individuelle (par caractéristique, indépendamment) */
  PALIERS: [
    ["Débutant", 0], ["Apprenti confirmé", 1], ["Entraîné", 2], ["Expérimenté", 3], ["Expert", 4],
    ["Maître", 5], ["Maître exceptionnel", 6], ["Hors norme", 8],
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

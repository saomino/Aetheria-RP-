/* =====================================================================
   AETHERIA — configuration
   1) Colle ici l'URL et la clé "anon public" de ton projet Supabase
      (Supabase > Project Settings > API).
   2) Tant que ces deux champs sont vides, le site tourne en MODE DÉMO :
      tout est enregistré seulement dans ton navigateur.
   ===================================================================== */

window.AETHERIA_CONFIG = {
  SUPABASE_URL: "https://jipcoqcbjvhtaqrbgsud.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcGNvcWNianZodGFxcmJnc3VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0ODE4MTIsImV4cCI6MjEwOTA1NzgxMn0.DqwtapVPqqA6lyt4UhpUOzqdLa4AAY7Y9SfdVE59RWw",   // clé publique "anon", sans danger

  NOM_SITE: "Aetheria",
  SOUS_TITRE: "Encyclopédie du monde & des légendes",

  /* Catégories du site.
     - id : lettres minuscules, chiffres et tirets seulement (ne pas changer une fois utilisé)
     - champs : suggestions de cases pour la fiche (le joueur peut en ajouter d'autres)
     - adminSeulement : seuls les admins peuvent publier dans cette catégorie
     - chronologie : affiche les fiches sur une frise, triées par année            */
  CATEGORIES: [
    { id: "personnages", nom: "Personnages", icone: "⚔", description: "Héros, vilains, figures du monde et personnages joueurs.",
      champs: ["Joueur", "Race / Peuple", "Âge", "Rôle / Classe", "Affiliation", "Statut", "Lieu d'origine"] },
    { id: "monde", nom: "Le Monde", icone: "🗺", description: "Continents, royaumes, villes et lieux remarquables.",
      champs: ["Type de lieu", "Région", "Dirigeant", "Population", "Climat", "Danger"] },
    { id: "peuples", nom: "Peuples & Races", icone: "👁", description: "Les peuples qui habitent Aetheria, leurs coutumes et leurs langues.",
      champs: ["Espérance de vie", "Taille moyenne", "Langue", "Territoires", "Affinité magique"] },
    { id: "bestiaire", nom: "Bestiaire", icone: "🐉", description: "Créatures, monstres et animaux du monde.",
      champs: ["Habitat", "Taille", "Dangerosité", "Comportement", "Faiblesses", "Rareté"] },
    { id: "magie", nom: "Magie", icone: "✦", description: "Écoles, sorts, rituels et lois de la magie.",
      champs: ["École", "Niveau / Rang", "Source", "Coût", "Portée", "Effets secondaires"] },
    { id: "factions", nom: "Factions & Guildes", icone: "⚑", description: "Ordres, guildes, clans, cultes et organisations.",
      champs: ["Chef", "Siège", "Membres", "Objectifs", "Alliés", "Ennemis"] },
    { id: "divinites", nom: "Divinités & Croyances", icone: "☀", description: "Dieux, panthéons, religions et mythes.",
      champs: ["Domaine", "Symbole", "Alignement", "Fidèles", "Lieux saints"] },
    { id: "objets", nom: "Objets & Artefacts", icone: "🗡", description: "Armes légendaires, reliques, artefacts et objets rares.",
      champs: ["Type", "Rareté", "Propriétaire actuel", "Pouvoirs", "Origine"] },
    { id: "histoire", nom: "Chronologie", icone: "⌛", description: "Les grands événements de l'histoire d'Aetheria.", chronologie: true,
      champs: ["Ère", "Lieu", "Acteurs principaux", "Conséquences"] },
    { id: "chroniques", nom: "Chroniques RP", icone: "✎", description: "Récits et résumés des parties de RP.",
      champs: ["Date de la partie", "Participants", "Lieu", "Arc / Campagne"] },
    { id: "regles", nom: "Règles du RP", icone: "§", description: "Règlement, système de jeu et conseils aux joueurs.", adminSeulement: true,
      champs: [] }
  ]
};

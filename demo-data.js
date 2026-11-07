/* Données du MODE DÉMO (seulement tant que Supabase n'est pas branché).
   Aucune fiche : le site démarre vide. */
window.AETHERIA_DEMO_DATA = function () {
  return {
    connecte: "admin-demo",
    profils: [{ id: "admin-demo", pseudo: "Toi (admin)", role: "admin", cree_le: new Date().toISOString() }],
    invitations: [],
    fiches: [],
    moments: [],
    des: {},
    races_des: {},
    lancers: [],
  };
};

/* =====================================================================
   AETHERIA — accès aux données
   Deux "moteurs" avec les mêmes fonctions :
     - SupabaseAPI : le vrai site, partagé entre tous les joueurs
     - DemoAPI     : mode démo, tout reste dans le navigateur
   ===================================================================== */

(function () {
  const CFG = window.AETHERIA_CONFIG;
  const CHAMPS_LISTE = "id,categorie,titre,resume,image_url,infos,annee,galerie,auteur_id,cree_le,modifie_le";

  function erreur(e) {
    if (!e) return;
    const msg = (e.message || String(e))
      .replace("Invalid login credentials", "Email ou mot de passe incorrect.")
      .replace("Email not confirmed", "Confirme d'abord ton adresse email (regarde ta boîte mail).")
      .replace("User already registered", "Un compte existe déjà avec cet email.")
      .replace(/Password should be at least (\d+) characters.*/, "Le mot de passe doit faire au moins $1 caractères.");
    throw new Error(msg);
  }

  function nettoyerFiche(d) {
    return {
      categorie: d.categorie,
      titre: (d.titre || "").trim(),
      resume: (d.resume || "").trim() || null,
      image_url: (d.image_url || "").trim() || null,
      infos: (d.infos || []).filter((i) => i.cle && i.cle.trim()).map((i) => ({ cle: i.cle.trim(), valeur: (i.valeur || "").trim() })),
      contenu: d.contenu || "",
      galerie: (d.galerie || []).filter((g) => /^(https?:\/\/|data:image\/)/i.test(g.url || "")).slice(0, 100).map((g) => ({ url: g.url, legende: (g.legende || "").trim().slice(0, 200) })),
      annee: d.annee === "" || d.annee == null || isNaN(+d.annee) ? null : parseInt(d.annee, 10),
    };
  }

  /* Réduit les photos trop lourdes (photos de téléphone) avant l'envoi */
  async function compresser(fichier, maxOctets, maxCote) {
    if (fichier.type === "image/gif" || (fichier.size <= maxOctets && fichier.type !== "image/heic")) return fichier;
    const url = URL.createObjectURL(fichier);
    try {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("Format d'image non reconnu.")); i.src = url; });
      let qualite = 0.85, cote = maxCote, blob;
      for (let essai = 0; essai < 5; essai++) {
        const r = Math.min(1, cote / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", qualite));
        if (blob && blob.size <= maxOctets) break;
        qualite -= 0.1; cote = Math.round(cote * 0.8);
      }
      if (!blob || blob.size > maxOctets) throw new Error("Image trop lourde, même après réduction.");
      return new File([blob], (fichier.name || "image").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } finally { URL.revokeObjectURL(url); }
  }

  /* ------------------------------------------------------------------ */
  class SupabaseAPI {
    constructor() {
      this.mode = "supabase";
      this.moi = null;
      this.cache = null;
      this.ecouteurs = [];
    }

    async init() {
      this.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
      });
      // Si on revient d'un lien de confirmation (?code=...), nettoyer l'adresse
      const { data } = await this.sb.auth.getSession();
      if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash);
      await this._chargerMoi(data.session);
      // (setTimeout : évite un blocage connu de supabase-js dans ce rappel)
      this.sb.auth.onAuthStateChange((_evt, session) => {
        setTimeout(async () => {
          const avant = this.moi && this.moi.user.id;
          if (((session && session.user.id) || null) === (avant || null)) return;
          await this._chargerMoi(session);
          this.ecouteurs.forEach((f) => f(this.moi));
        }, 0);
      });
    }

    onChange(f) { this.ecouteurs.push(f); }

    async _chargerMoi(session) {
      if (!session) { this.moi = null; return; }
      const user = session.user;
      let { data: profil } = await this.sb.from("profils").select("*").eq("id", user.id).maybeSingle();
      let erreurProfil = null;
      if (!profil) {
        const meta = user.user_metadata || {};
        const code = meta.invite || localStorage.getItem("aetheria_invite") || "";
        const pseudo = meta.pseudo || (user.email || "").split("@")[0];
        const r = await this.sb.rpc("rejoindre", { code_invitation: code, pseudo_choisi: pseudo });
        if (r.error) erreurProfil = r.error.message;
        else {
          localStorage.removeItem("aetheria_invite");
          ({ data: profil } = await this.sb.from("profils").select("*").eq("id", user.id).maybeSingle());
        }
      }
      this.moi = { user: { id: user.id, email: user.email }, profil: profil || null, erreurProfil };
    }

    getMoi() { return this.moi; }

    async verifierInvitation(code) {
      const { data, error } = await this.sb.rpc("verifier_invitation", { code_invitation: code || "" });
      if (error) return false;
      return !!data;
    }

    async inscrire({ email, mdp, pseudo, invite }) {
      localStorage.setItem("aetheria_invite", invite || "");
      const { data, error } = await this.sb.auth.signUp({
        email, password: mdp,
        options: { data: { pseudo, invite }, emailRedirectTo: location.origin + location.pathname },
      });
      erreur(error);
      if (data.session) {
        await this._chargerMoi(data.session);
        this.ecouteurs.forEach((f) => f(this.moi));
        if (this.moi && this.moi.erreurProfil) throw new Error(this.moi.erreurProfil);
        return { confirmationRequise: false };
      }
      return { confirmationRequise: true };
    }

    async rejoindreAvecCode(code, pseudo) {
      const { error } = await this.sb.rpc("rejoindre", { code_invitation: code, pseudo_choisi: pseudo });
      erreur(error);
      const { data } = await this.sb.auth.getSession();
      await this._chargerMoi(data.session);
      this.ecouteurs.forEach((f) => f(this.moi));
    }

    async connecter({ email, mdp }) {
      const { data, error } = await this.sb.auth.signInWithPassword({ email, password: mdp });
      erreur(error);
      await this._chargerMoi(data.session);
      this.ecouteurs.forEach((f) => f(this.moi));
    }

    async deconnecter() {
      await this.sb.auth.signOut();
      this.moi = null;
      this.ecouteurs.forEach((f) => f(this.moi));
    }

    async motDePasseOublie(email) {
      const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "#/compte" });
      erreur(error);
    }

    async changerMotDePasse(mdp) {
      const { error } = await this.sb.auth.updateUser({ password: mdp });
      erreur(error);
    }

    async changerPseudo(p) {
      const { error } = await this.sb.rpc("changer_pseudo", { nouveau: p });
      erreur(error);
      this.moi.profil.pseudo = p.trim();
      this.cacheProfils = null;
    }

    /* ---- Fiches ---- */
    async listerFiches(forcer) {
      if (this.cache && !forcer) return this.cache;
      const { data, error } = await this.sb.from("fiches").select(CHAMPS_LISTE).order("titre");
      erreur(error);
      this.cache = data;
      return data;
    }

    async lireFiche(id) {
      const { data, error } = await this.sb.from("fiches").select("*").eq("id", id).maybeSingle();
      erreur(error);
      return data;
    }

    async creerFiche(d) {
      const { data, error } = await this.sb.from("fiches").insert({ ...nettoyerFiche(d), auteur_id: this.moi.user.id }).select("id").single();
      erreur(error);
      this.cache = null;
      return data.id;
    }

    async modifierFiche(id, d) {
      const { error } = await this.sb.from("fiches").update(nettoyerFiche(d)).eq("id", id);
      erreur(error);
      this.cache = null;
    }

    async supprimerFiche(id) {
      const { error } = await this.sb.from("fiches").delete().eq("id", id);
      erreur(error);
      this.cache = null;
    }

    async envoyerImage(fichier) {
      fichier = await compresser(fichier, 4.5 * 1024 * 1024, 2400);
      const ext = (fichier.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const chemin = `${this.moi.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await this.sb.storage.from("images").upload(chemin, fichier, { contentType: fichier.type });
      erreur(error);
      return this.sb.storage.from("images").getPublicUrl(chemin).data.publicUrl;
    }

    /* ---- Moments marquants ---- */
    async listerMoments({ ficheId, limite } = {}) {
      let q = this.sb.from("moments").select("*").order("cree_le", { ascending: false });
      if (ficheId) q = q.contains("fiches", [ficheId]);
      if (limite) q = q.limit(limite);
      const { data, error } = await q;
      if (error) { console.warn("Moments indisponibles (relance schema.sql dans Supabase) :", error.message); return []; }
      return data;
    }
    async creerMoment({ texte, quand, fiches }) {
      const { error } = await this.sb.from("moments").insert({ texte: texte.trim(), quand: (quand || "").trim() || null, fiches, auteur_id: this.moi.user.id });
      erreur(error);
    }
    async supprimerMoment(id) {
      const { error } = await this.sb.from("moments").delete().eq("id", id);
      erreur(error);
    }

    /* ---- Membres ---- */
    async listerProfils(forcer) {
      if (this.cacheProfils && !forcer) return this.cacheProfils;
      const { data, error } = await this.sb.from("profils").select("*").order("pseudo");
      erreur(error);
      this.cacheProfils = data;
      return data;
    }

    async changerRole(id, role) {
      const { error } = await this.sb.from("profils").update({ role }).eq("id", id);
      erreur(error);
      this.cacheProfils = null;
    }

    /* ---- Invitations (admin) ---- */
    async listerInvitations() {
      const { data, error } = await this.sb.from("invitations").select("*").order("cree_le", { ascending: false });
      erreur(error);
      return data;
    }

    async creerInvitation({ note, max, jours }) {
      const ligne = {
        note: note || null,
        max_utilisations: max ? parseInt(max, 10) : null,
        expire_le: jours ? new Date(Date.now() + jours * 86400000).toISOString() : null,
        cree_par: this.moi.user.id,
      };
      const { data, error } = await this.sb.from("invitations").insert(ligne).select("*").single();
      erreur(error);
      return data;
    }

    async supprimerInvitation(code) {
      const { error } = await this.sb.from("invitations").delete().eq("code", code);
      erreur(error);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  MODE DÉMO : stockage local, tu es admin d'office                   */
  /* ------------------------------------------------------------------ */
  class DemoAPI {
    constructor() {
      this.mode = "demo";
      this.ecouteurs = [];
      this.memoire = null;
    }

    _lire() {
      if (this.memoire) return this.memoire;
      let d = null;
      try { d = JSON.parse(localStorage.getItem("aetheria_demo") || "null"); } catch (e) {}
      this.memoire = d || window.AETHERIA_DEMO_DATA();
      return this.memoire;
    }
    _ecrire() {
      try { localStorage.setItem("aetheria_demo", JSON.stringify(this.memoire)); }
      catch (e) { throw new Error("Mémoire de la démo pleine (trop d'images). Sur le vrai site, il n'y a pas ce problème."); }
    }

    async init() {
      const d = this._lire();
      const p = d.profils.find((x) => x.id === d.connecte);
      this.moi = p ? { user: { id: p.id, email: "demo@aetheria" }, profil: p } : null;
    }
    onChange(f) { this.ecouteurs.push(f); }
    _notifier() { this.ecouteurs.forEach((f) => f(this.moi)); }
    getMoi() { return this.moi; }

    async verifierInvitation(code) {
      const d = this._lire();
      return d.invitations.some((i) => i.code === code && (i.max_utilisations == null || i.utilisations < i.max_utilisations) && (!i.expire_le || new Date(i.expire_le) > new Date()));
    }
    async inscrire({ pseudo, invite }) {
      const d = this._lire();
      if (!(await this.verifierInvitation(invite))) throw new Error("Lien d'invitation invalide.");
      const inv = d.invitations.find((i) => i.code === invite);
      inv.utilisations++;
      const p = { id: "u" + Date.now(), pseudo, role: "membre", cree_le: new Date().toISOString() };
      d.profils.push(p);
      d.connecte = p.id;
      this._ecrire(); await this.init(); this._notifier();
      return { confirmationRequise: false };
    }
    async rejoindreAvecCode() {}
    async connecter() {
      const d = this._lire();
      d.connecte = d.profils.find((p) => p.role === "admin").id;
      this._ecrire(); await this.init(); this._notifier();
    }
    async deconnecter() { const d = this._lire(); d.connecte = null; this._ecrire(); this.moi = null; this._notifier(); }
    async motDePasseOublie() {}
    async changerMotDePasse() {}
    async changerPseudo(p) { this.moi.profil.pseudo = p.trim(); this._ecrire(); }

    async listerFiches() {
      return this._lire().fiches.map(({ contenu, ...reste }) => reste).sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
    }
    async lireFiche(id) { return this._lire().fiches.find((f) => f.id === id) || null; }
    async creerFiche(data) {
      const f = { ...nettoyerFiche(data), id: "f" + Date.now(), auteur_id: this.moi.user.id, cree_le: new Date().toISOString(), modifie_le: new Date().toISOString() };
      this._lire().fiches.push(f); this._ecrire(); return f.id;
    }
    async modifierFiche(id, data) {
      const f = this._lire().fiches.find((x) => x.id === id);
      Object.assign(f, nettoyerFiche(data), { modifie_le: new Date().toISOString() }); this._ecrire();
    }
    async supprimerFiche(id) { const d = this._lire(); d.fiches = d.fiches.filter((f) => f.id !== id); this._ecrire(); }
    async envoyerImage(fichier) {
      fichier = await compresser(fichier, 250 * 1024, 1000);   // la démo stocke dans le navigateur : petites images
      return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(fichier); });
    }

    async listerMoments({ ficheId, limite } = {}) {
      const d = this._lire();
      let l = [...(d.moments || [])].sort((a, b) => b.cree_le.localeCompare(a.cree_le));
      if (ficheId) l = l.filter((m) => m.fiches.includes(ficheId));
      return limite ? l.slice(0, limite) : l;
    }
    async creerMoment({ texte, quand, fiches }) {
      const d = this._lire();
      d.moments = d.moments || [];
      d.moments.push({ id: "m" + Date.now(), texte: texte.trim(), quand: (quand || "").trim() || null, fiches, auteur_id: this.moi.user.id, cree_le: new Date().toISOString() });
      this._ecrire();
    }
    async supprimerMoment(id) { const d = this._lire(); d.moments = (d.moments || []).filter((m) => m.id !== id); this._ecrire(); }

    async listerProfils() { return [...this._lire().profils].sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr")); }
    async changerRole(id, role) { this._lire().profils.find((p) => p.id === id).role = role; this._ecrire(); }

    async listerInvitations() { return [...this._lire().invitations].reverse(); }
    async creerInvitation({ note, max, jours }) {
      const inv = {
        code: Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10),
        note: note || null, max_utilisations: max ? +max : null, utilisations: 0,
        expire_le: jours ? new Date(Date.now() + jours * 86400000).toISOString() : null, cree_le: new Date().toISOString(),
      };
      this._lire().invitations.push(inv); this._ecrire(); return inv;
    }
    async supprimerInvitation(code) { const d = this._lire(); d.invitations = d.invitations.filter((i) => i.code !== code); this._ecrire(); }
    reinitialiser() { localStorage.removeItem("aetheria_demo"); this.memoire = null; }
  }

  window.AetheriaAPI = {
    creer() {
      const configure = CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase;
      return configure ? new SupabaseAPI() : new DemoAPI();
    },
  };
})();

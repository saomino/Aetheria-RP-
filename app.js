/* =====================================================================
   AETHERIA — application (pages, navigation, formulaires)
   ===================================================================== */
(function () {
  const CFG = window.AETHERIA_CONFIG;
  const CATS = CFG.CATEGORIES;
  const catParId = (id) => CATS.find((c) => c.id === id) || { id, nom: id, icone: "•", champs: [] };
  const api = window.AetheriaAPI.creer();
  const app = document.getElementById("app");

  /* ---------------- Outils ---------------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const urlSure = (u) => /^(https?:\/\/|data:image\/)/i.test(u || "");
  const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
  const normal = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const moi = () => api.getMoi();
  const role = () => (moi() && moi().profil ? moi().profil.role : null);
  const estAdmin = () => role() === "admin";
  const estMembre = () => role() === "admin" || role() === "membre";
  const peutPublier = (cat) => estAdmin() || (estMembre() && !catParId(cat).adminSeulement);
  const peutModifier = (f) => estAdmin() || (estMembre() && f.auteur_id === moi().user.id);
  const lienInvitation = (code) => location.origin + location.pathname + "#/inscription?invite=" + encodeURIComponent(code);

  function toast(msg, type = "ok") {
    const t = document.createElement("div");
    t.className = "toast toast-" + type;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("visible"));
    setTimeout(() => { t.classList.remove("visible"); setTimeout(() => t.remove(), 300); }, 3200);
  }

  async function copier(texte) {
    try { await navigator.clipboard.writeText(texte); toast("Lien copié !"); }
    catch (e) { prompt("Copie ce lien :", texte); }
  }

  /* ---------------- Markdown (sécurisé : tout est échappé d'abord) ---------------- */
  let indexTitres = new Map();
  let indexParId = new Map();

  const COULEURS = [
    ["rouge", "#ff6b6b"], ["orange", "#ffa94d"], ["jaune", "#ffd43b"], ["vert", "#69db7c"], ["bleu", "#4dabf7"],
    ["violet", "#b197fc"], ["rose", "#f783ac"], ["or", "#e3b866"], ["gris", "#adb5bd"], ["blanc", "#ffffff"], ["noir", "#111111"],
  ];
  const RE_COULEUR = new RegExp(`\\[(${COULEURS.map((c) => c[0]).join("|")})\\]([\\s\\S]*?)\\[\\/\\1\\]`, "g");
  const sansMarkdown = (t) => String(t || "").replace(RE_COULEUR, "$2").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_~`#>]+/g, "").replace(/\s+/g, " ").trim();

  function inline(t) {
    t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    for (let i = 0; i < 3; i++) t = t.replace(RE_COULEUR, (_, c, x) => `<span class="c-${c}">${x}</span>`);
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => (urlSure(u) ? `<img src="${u}" alt="${alt}" loading="lazy">` : m));
    t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, titre, texte) => {
      const brut = titre.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const f = indexTitres.get(normal(brut));
      const lib = texte || titre;
      return f
        ? `<a class="wiki" href="#/f/${encodeURIComponent(f.id)}">${lib}</a>`
        : `<a class="wiki manquant" title="Cette fiche n'existe pas encore" href="#/nouveau?titre=${encodeURIComponent(brut)}">${lib}</a>`;
    });
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, u) => (/^(https?:\/\/|#)/i.test(u) ? `<a href="${u}"${u[0] === "#" ? "" : ' target="_blank" rel="noopener"'}>${txt}</a>` : m));
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return t;
  }

  function markdown(src) {
    const lignes = esc(src || "").replace(/\r/g, "").split("\n");
    let html = "", para = [], liste = null, citation = [];
    const finPara = () => { if (para.length) { html += `<p>${inline(para.join("<br>"))}</p>`; para = []; } };
    const finListe = () => { if (liste) { html += `<${liste.type}>${liste.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${liste.type}>`; liste = null; } };
    const finCitation = () => { if (citation.length) { html += `<blockquote>${markdown_inline_bloc(citation)}</blockquote>`; citation = []; } };
    const markdown_inline_bloc = (ls) => ls.map((l) => `<p>${inline(l)}</p>`).join("");
    const tout = () => { finPara(); finListe(); finCitation(); };

    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (/^```/.test(l)) {
        tout();
        let code = [];
        i++;
        while (i < lignes.length && !/^```/.test(lignes[i])) code.push(lignes[i++]);
        html += `<pre><code>${code.join("\n")}</code></pre>`;
        continue;
      }
      let m;
      if (!l.trim()) { tout(); continue; }
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { tout(); const n = Math.max(2, Math.min(m[1].length, 4)); html += `<h${n}>${inline(m[2])}</h${n}>`; continue; }
      if (/^(-{3,}|\*{3,})\s*$/.test(l)) { tout(); html += "<hr>"; continue; }
      if ((m = l.match(/^&gt;\s?(.*)$/))) { finPara(); finListe(); citation.push(m[1]); continue; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { finPara(); finCitation(); if (!liste || liste.type !== "ul") { finListe(); liste = { type: "ul", items: [] }; } liste.items.push(m[1]); continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { finPara(); finCitation(); if (!liste || liste.type !== "ol") { finListe(); liste = { type: "ol", items: [] }; } liste.items.push(m[1]); continue; }
      finListe(); finCitation();
      para.push(l);
    }
    tout();
    return html;
  }

  async function majIndexTitres() {
    const fiches = await api.listerFiches();
    indexTitres = new Map(fiches.map((f) => [normal(f.titre), f]));
    indexParId = new Map(fiches.map((f) => [f.id, f]));
    return fiches;
  }

  /* ---------------- Interface commune ---------------- */
  function entete() {
    const m = moi();
    const route = (location.hash.replace(/^#/, "") || "/").split("?")[0];
    const onglet =
      route === "/" ? "accueil" :
      /^\/(wiki|c|f|nouveau|editer)/.test(route) ? "wiki" :
      route.startsWith("/recherche") ? "recherche" :
      /^\/(joueurs|joueur)/.test(route) ? "joueurs" :
      route.startsWith("/admin") ? "admin" : "moi";
    $("#entete").innerHTML = `
      ${api.mode === "demo" ? `<div class="bandeau-demo">Mode démo : rien n'est partagé tant que <code>config.js</code> n'est pas rempli. <button class="lien" id="reset-demo">Tout effacer</button></div>` : ""}
      <div class="barre">
        <a class="logo" href="#/"><span class="logo-etoile">✧</span>${esc(CFG.NOM_SITE)}</a>
        <div class="compte">
          ${estMembre() ? `<a class="btn btn-or petit" href="#/nouveau">+ Fiche</a>` : !m ? `<a class="btn petit" href="#/connexion">Connexion</a>` : ""}
        </div>
      </div>`;
    const tabs = [
      ["accueil", "#/", "🏠", "Accueil"],
      ["wiki", "#/wiki", "📚", "Wiki"],
      ["recherche", "#/recherche", "🔍", "Recherche"],
      ["joueurs", "#/joueurs", "👥", "Joueurs"],
      ...(estAdmin() ? [["admin", "#/admin", "⚙️", "Admin"]] : []),
      ["moi", m ? "#/compte" : "#/connexion", "👤", m && m.profil ? "Moi" : "Connexion"],
    ];
    $("#onglets").innerHTML = tabs.map(([id, href, ic, nom]) => `<a href="${href}" class="${id === onglet ? "actif" : ""}"><span class="o-ic">${ic}</span><span class="o-nom">${esc(nom)}</span></a>`).join("");
    const r = $("#reset-demo");
    if (r) r.onclick = () => { if (confirm("Effacer tout ce que tu as fait en démo ?")) { api.reinitialiser(); location.hash = "#/"; location.reload(); } };
  }

  /* Menu déroulant des catégories */
  function choixCategorie(actuelle, fiches) {
    const nb = (id) => fiches.filter((f) => f.categorie === id).length;
    return `<label class="choix-cat"><span>Catégorie</span>
      <select id="choix-cat">
        ${actuelle ? "" : `<option value="" selected disabled>Choisir une catégorie…</option>`}
        ${CATS.map((c) => `<option value="${c.id}" ${c.id === actuelle ? "selected" : ""}>${c.icone}  ${esc(c.nom)} (${nb(c.id)})</option>`).join("")}
      </select></label>`;
  }
  function brancherChoixCategorie() {
    const s = $("#choix-cat");
    if (s) s.onchange = () => (location.hash = "#/c/" + s.value);
  }

  function carte(f, auteurs) {
    const c = catParId(f.categorie);
    const a = auteurs && auteurs.get(f.auteur_id);
    return `<a class="carte" href="#/f/${encodeURIComponent(f.id)}">
      <div class="carte-visuel">${urlSure(f.image_url) ? `<img src="${esc(f.image_url)}" alt="" loading="lazy">` : `<span>${c.icone}</span>`}</div>
      <div class="carte-corps">
        <div class="carte-cat">${esc(c.nom)}</div>
        <h3>${esc(f.titre)}</h3>
        ${f.resume ? `<p>${esc(f.resume)}</p>` : ""}
        ${a || (f.galerie || []).length ? `<div class="carte-auteur">${a ? "par " + esc(a.pseudo) : ""}${(f.galerie || []).length ? ` · 🖼 ${f.galerie.length}` : ""}</div>` : ""}
      </div></a>`;
  }

  async function auteursMap() {
    const p = await api.listerProfils();
    return new Map(p.map((x) => [x.id, x]));
  }

  const vide = (msg, lien) => `<div class="vide"><div class="vide-ic">✧</div><p>${msg}</p>${lien || ""}</div>`;

  /* Visionneuse plein écran (balayer ou flèches pour changer d'image) */
  function visionneuse(images, depart) {
    let i = depart;
    const v = document.createElement("div");
    v.className = "visionneuse";
    const maj = () => {
      const g = images[i];
      v.innerHTML = `<button class="v-fermer" aria-label="Fermer">✕</button>
        ${images.length > 1 ? `<button class="v-prec" aria-label="Précédente">‹</button><button class="v-suiv" aria-label="Suivante">›</button>` : ""}
        <figure><img src="${esc(g.url)}" alt=""><figcaption>${esc(g.legende || "")}<span>${i + 1} / ${images.length}</span></figcaption></figure>`;
      $(".v-fermer", v).onclick = fermer;
      if (images.length > 1) { $(".v-prec", v).onclick = (e) => { e.stopPropagation(); aller(-1); }; $(".v-suiv", v).onclick = (e) => { e.stopPropagation(); aller(1); }; }
    };
    const aller = (d) => { i = (i + d + images.length) % images.length; maj(); };
    const clavier = (e) => { if (e.key === "Escape") fermer(); if (e.key === "ArrowLeft") aller(-1); if (e.key === "ArrowRight") aller(1); };
    const fermer = () => { v.remove(); document.removeEventListener("keydown", clavier); window.removeEventListener("hashchange", fermer); };
    let x0 = null;
    v.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    v.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) aller(dx < 0 ? 1 : -1); x0 = null; });
    v.addEventListener("click", (e) => { if (e.target === v) fermer(); });
    document.addEventListener("keydown", clavier);
    window.addEventListener("hashchange", fermer);
    maj();
    document.body.appendChild(v);
  }

  /* Moments marquants */
  const texteMoment = (t) => esc(t).split("\n").map(inline).join("<br>");
  function htmlMoment(m, auteurs, ficheActuelle) {
    const a = auteurs.get(m.auteur_id);
    const autres = m.fiches.filter((id) => id !== ficheActuelle).map((id) => indexParId.get(id)).filter(Boolean);
    const peutSuppr = estAdmin() || (estMembre() && m.auteur_id === moi().user.id);
    return `<li class="moment">
      <div class="moment-quand">${esc(m.quand || dateFr(m.cree_le))}</div>
      <div class="moment-texte">${texteMoment(m.texte)}</div>
      ${autres.length ? `<div class="moment-liens">${ficheActuelle ? "Avec" : "Concerne"} : ${autres.map((f) => `<a href="#/f/${encodeURIComponent(f.id)}">${esc(f.titre)}</a>`).join(", ")}</div>` : ""}
      <div class="moment-pied">${a ? "noté par " + esc(a.pseudo) : ""}${m.quand ? " · " + dateFr(m.cree_le) : ""}${peutSuppr ? ` · <button class="lien" data-suppr-moment="${esc(m.id)}">supprimer</button>` : ""}</div>
    </li>`;
  }
  function brancherSuppressionMoments() {
    $$("[data-suppr-moment]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Supprimer ce moment ? Il disparaîtra de toutes les fiches concernées.")) return;
      try { await api.supprimerMoment(b.dataset.supprMoment); toast("Moment supprimé."); router(); } catch (e) { toast(e.message, "erreur"); }
    }));
  }

  /* ---------------- Partage d'une fiche ---------------- */
  const lienFiche = (f) => location.origin + location.pathname + "#/f/" + encodeURIComponent(f.id);
  const nomFichier = (f) => (normal(f.titre).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fiche") + "-aetheria.png";

  function chargerImage(url) {
    return new Promise((ok) => {
      if (!urlSure(url)) return ok(null);
      const img = new Image();
      if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = url;
    });
  }

  function lignes(ctx, texte, largeur, max) {
    const mots = String(texte).split(/\s+/), res = [];
    let l = "";
    for (const m of mots) {
      const essai = l ? l + " " + m : m;
      if (ctx.measureText(essai).width > largeur && l) { res.push(l); l = m; } else l = essai;
      if (res.length === max) break;
    }
    if (res.length < max && l) res.push(l);
    if (res.length === max && mots.join(" ").length > res.join(" ").length + 1) {
      let d = res[max - 1];
      while (ctx.measureText(d + "…").width > largeur && d.length) d = d.slice(0, -1);
      res[max - 1] = d.replace(/[\s,.;:]+$/, "") + "…";
    }
    return res;
  }

  function rectArrondi(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* Dessine une "carte" de la fiche (1080 × 1350, format idéal pour Discord / Insta) */
  async function imageFiche(f, auteur) {
    try { await document.fonts.ready; } catch (e) {}
    const W = 1080, H = 1350, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const cat = catParId(f.categorie);
    const TITRES = '"Cinzel", Georgia, serif', CORPS = '"EB Garamond", Georgia, serif', SANS = "system-ui, sans-serif";

    const fond = ctx.createLinearGradient(0, 0, 0, H);
    fond.addColorStop(0, "#1b2148"); fond.addColorStop(1, "#0b0e20");
    ctx.fillStyle = fond; ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 700);
    halo.addColorStop(0, "rgba(127,200,248,0.18)"); halo.addColorStop(1, "rgba(127,200,248,0)");
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    let graine = f.titre.length * 97 + 13;
    const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${0.15 + alea() * 0.5})`; ctx.fillRect(alea() * W, alea() * H, 2, 2); }
    ctx.strokeStyle = "rgba(227,184,102,0.55)"; ctx.lineWidth = 3; rectArrondi(ctx, 28, 28, W - 56, H - 56, 28); ctx.stroke();
    ctx.strokeStyle = "rgba(227,184,102,0.2)"; ctx.lineWidth = 1; rectArrondi(ctx, 40, 40, W - 80, H - 80, 22); ctx.stroke();

    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e3b866"; ctx.font = `700 34px ${TITRES}`;
    ctx.fillText("✧  " + CFG.NOM_SITE.toUpperCase() + "  ✧", W / 2, 112);
    ctx.fillStyle = "#7fc8f8"; ctx.font = `600 26px ${SANS}`;
    ctx.fillText((cat.icone + "  " + cat.nom).toUpperCase(), W / 2, 162);

    let y = 250;
    ctx.fillStyle = "#ffffff"; ctx.font = `500 76px ${TITRES}`;
    let lt = lignes(ctx, f.titre, W - 180, 2);
    if (lt.length > 1) { ctx.font = `500 60px ${TITRES}`; lt = lignes(ctx, f.titre, W - 180, 2); }
    lt.forEach((l) => { ctx.fillText(l, W / 2, y); y += lt.length > 1 ? 70 : 80; });

    const img = await chargerImage(f.image_url || ((f.galerie || [])[0] || {}).url);
    const infos = (f.infos || []).filter((i) => i.valeur && i.valeur.trim());
    if (img) {
      const zw = W - 180, zh = infos.length > 4 ? 400 : infos.length > 2 ? 450 : 560, zx = 90, zy = y + 10;
      ctx.save(); rectArrondi(ctx, zx, zy, zw, zh, 22); ctx.clip();
      const r = Math.max(zw / img.naturalWidth, zh / img.naturalHeight);
      const iw = img.naturalWidth * r, ih = img.naturalHeight * r;
      ctx.drawImage(img, zx + (zw - iw) / 2, zy + (zh - ih) / 3, iw, ih);
      ctx.restore();
      ctx.strokeStyle = "rgba(227,184,102,0.6)"; ctx.lineWidth = 2; rectArrondi(ctx, zx, zy, zw, zh, 22); ctx.stroke();
      y = zy + zh + 60;
    } else y += 30;

    const resume = f.resume || sansMarkdown(f.contenu);
    if (resume) {
      ctx.fillStyle = "#c9c6dc"; ctx.font = `italic 38px ${CORPS}`;
      const lr = lignes(ctx, resume, W - 200, img ? 2 : 4);
      lr.forEach((l) => { ctx.fillText(l, W / 2, y); y += 48; });
      y += 24;
    }

    const bas = H - 130;
    if (infos.length && y < bas - 60) {
      ctx.strokeStyle = "rgba(227,184,102,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(140, y - 10); ctx.lineTo(W - 140, y - 10); ctx.stroke();
      y += 34;
      const col = infos.length > 3 && W > 0 ? 2 : 1;
      const largCol = (W - 200) / col;
      let i = 0;
      while (i < infos.length && y + 45 < bas) {
        for (let k = 0; k < col && i < infos.length; k++, i++) {
          const x = col === 1 ? W / 2 : 100 + largCol * k + largCol / 2;
          ctx.textAlign = "center";
          ctx.fillStyle = "#9a9cbb"; ctx.font = `600 22px ${SANS}`;
          ctx.fillText(lignes(ctx, infos[i].cle.toUpperCase(), largCol - 30, 1)[0], x, y);
          ctx.fillStyle = "#f2efe6"; ctx.font = `34px ${CORPS}`;
          ctx.fillText(lignes(ctx, sansMarkdown(infos[i].valeur), largCol - 30, 1)[0], x, y + 40);
        }
        y += 92;
      }
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#e3b866"; ctx.font = `600 24px ${SANS}`;
    ctx.fillText(auteur ? "Fiche de " + auteur.pseudo : CFG.NOM_SITE, W / 2, H - 92);
    ctx.fillStyle = "#8c8fae"; ctx.font = `22px ${SANS}`;
    ctx.fillText((location.host + location.pathname).replace(/\/$/, ""), W / 2, H - 60);

    return await new Promise((ok, ko) => {
      try { c.toBlob((b) => (b ? ok(b) : ko(new Error("Impossible de créer l'image."))), "image/png"); }
      catch (e) { ko(new Error("L'image principale vient d'un autre site qui bloque la copie. Envoie l'image directement depuis le formulaire.")); }
    });
  }

  async function fenetrePartage(f, auteur) {
    const lien = lienFiche(f);
    const fond = document.createElement("div");
    fond.className = "feuille-fond";
    fond.innerHTML = `
      <div class="feuille" role="dialog" aria-label="Partager la fiche">
        <div class="feuille-poignee"></div>
        <h2>Partager « ${esc(f.titre)} »</h2>
        <div class="feuille-apercu" id="apercu-carte"><span class="discret">Création de l'image…</span></div>
        <div class="feuille-boutons">
          ${navigator.share ? `<button class="btn btn-or" id="p-lien">📤 Envoyer le lien</button>` : ""}
          <button class="btn ${navigator.share ? "" : "btn-or"}" id="p-image" disabled>🖼 Partager l'image</button>
          <button class="btn" id="p-dl" disabled>⬇️ Télécharger l'image</button>
          <button class="btn" id="p-copier">🔗 Copier le lien</button>
        </div>
        <button class="lien feuille-fermer" id="p-fermer">Fermer</button>
      </div>`;
    document.body.appendChild(fond);
    requestAnimationFrame(() => fond.classList.add("ouvert"));
    const fermer = () => { fond.classList.remove("ouvert"); setTimeout(() => fond.remove(), 250); window.removeEventListener("hashchange", fermer); };
    fond.onclick = (e) => { if (e.target === fond) fermer(); };
    window.addEventListener("hashchange", fermer);
    $("#p-fermer", fond).onclick = fermer;
    $("#p-copier", fond).onclick = () => copier(lien);
    const bl = $("#p-lien", fond);
    if (bl) bl.onclick = () => navigator.share({ title: f.titre + " — " + CFG.NOM_SITE, text: f.resume || f.titre, url: lien }).catch(() => {});

    let blob;
    try {
      blob = await imageFiche(f, auteur);
      const url = URL.createObjectURL(blob);
      $("#apercu-carte", fond).innerHTML = `<img src="${url}" alt="Aperçu de l'image de la fiche">`;
      const fichier = new File([blob], nomFichier(f), { type: "image/png" });
      const bi = $("#p-image", fond), bd = $("#p-dl", fond);
      bi.disabled = false; bd.disabled = false;
      bd.onclick = () => { const a = document.createElement("a"); a.href = url; a.download = fichier.name; document.body.appendChild(a); a.click(); a.remove(); };
      bi.onclick = async () => {
        if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
          try { await navigator.share({ files: [fichier], title: f.titre, text: f.titre + " — " + lien }); } catch (e) {}
        } else { bd.onclick(); toast("Image téléchargée : tu peux l'envoyer où tu veux."); }
      };
    } catch (e) {
      $("#apercu-carte", fond).innerHTML = `<p class="note">${esc(e.message)}</p>`;
    }
  }

  /* ---------------- Pages ---------------- */
  const pages = {};

  pages.accueil = async () => {
    const [fiches, auteurs, moments] = await Promise.all([majIndexTitres(), auteursMap(), api.listerMoments({ limite: 5 })]);
    const recents = [...fiches].sort((a, b) => (b.cree_le || "").localeCompare(a.cree_le || "")).slice(0, 6);
    const m = moi();
    return `
      <section class="hero">
        <div class="hero-etoiles"></div>
        <h1>${esc(CFG.NOM_SITE)}</h1>
        <p class="hero-sous">${esc(CFG.SOUS_TITRE)}</p>
        <div class="hero-stats"><span><b>${fiches.length}</b> fiche${fiches.length > 1 ? "s" : ""}</span><span><b>${auteurs.size}</b> joueur${auteurs.size > 1 ? "s" : ""}</span></div>
        <div class="hero-actions">
          ${estMembre() ? `<a class="btn btn-or" href="#/nouveau">Créer une fiche</a>` : !m ? `<a class="btn btn-or" href="#/connexion">Se connecter</a>` : ""}
        </div>
      </section>
      <h2 class="titre-section">Explorer le monde</h2>
      ${choixCategorie(null, fiches)}
      ${moments.length ? `<h2 class="titre-section">Derniers moments marquants</h2><ol class="journal">${moments.map((m) => htmlMoment(m, auteurs, null)).join("")}</ol>` : ""}
      <h2 class="titre-section">Derniers ajouts</h2>
      ${recents.length ? `<div class="grille">${recents.map((f) => carte(f, auteurs)).join("")}</div>` : vide("Aucune fiche pour l'instant.")}`;
  };
  pages.accueil.apres = () => { brancherChoixCategorie(); brancherSuppressionMoments(); };

  pages.wiki = async () => {
    const [fiches, auteurs] = await Promise.all([majIndexTitres(), auteursMap()]);
    return `
      <div class="entete-page"><div><h1><span class="ic-titre">📚</span>Wiki</h1><p class="discret">${fiches.length} fiche${fiches.length > 1 ? "s" : ""} au total</p></div></div>
      ${choixCategorie(null, fiches)}
      <h2 class="titre-section">Toutes les fiches</h2>
      ${fiches.length ? `<div class="grille">${fiches.map((f) => carte(f, auteurs)).join("")}</div>` : vide("Aucune fiche pour l'instant.")}`;
  };
  pages.wiki.apres = brancherChoixCategorie;

  pages.categorie = async (id) => {
    const c = catParId(id);
    const [fiches, auteurs] = await Promise.all([majIndexTitres(), auteursMap()]);
    fichesPourMenu = fiches;
    const liste = fiches.filter((f) => f.categorie === id);
    const bouton = peutPublier(id) ? `<a class="btn btn-or" href="#/nouveau?cat=${id}">+ Ajouter</a>` : "";
    if (c.chronologie) {
      const tri = [...liste].sort((a, b) => (a.annee ?? 1e9) - (b.annee ?? 1e9));
      return `${enteteCat(c, liste.length, bouton)}
        ${tri.length ? `<ol class="frise">${tri.map((f) => `<li><div class="frise-annee">${f.annee != null ? "An " + esc(f.annee) : "?"}</div><a class="frise-carte" href="#/f/${encodeURIComponent(f.id)}"><h3>${esc(f.titre)}</h3>${f.resume ? `<p>${esc(f.resume)}</p>` : ""}</a></li>`).join("")}</ol>` : vide("Aucun événement pour l'instant.")}`;
    }
    return `${enteteCat(c, liste.length, bouton)}
      ${liste.length > 3 ? `<div class="filtres"><input type="search" id="filtre" placeholder="Filtrer ${esc(c.nom.toLowerCase())}…"><select id="tri"><option value="az">A → Z</option><option value="recent">Plus récents</option><option value="modif">Modifiés récemment</option></select></div>` : ""}
      <div class="grille" id="liste">${liste.map((f) => carte(f, auteurs)).join("")}</div>
      ${liste.length ? "" : vide("Aucune fiche dans cette catégorie pour l'instant.")}`;
  };
  pages.categorie.apres = (id) => {
    brancherChoixCategorie();
    const filtre = $("#filtre"), tri = $("#tri");
    if (!filtre) return;
    const maj = async () => {
      const [fiches, auteurs] = await Promise.all([api.listerFiches(), auteursMap()]);
      const q = normal(filtre.value);
      let l = fiches.filter((f) => f.categorie === id && (!q || normal(f.titre + " " + (f.resume || "") + " " + (f.infos || []).map((i) => i.valeur).join(" ")).includes(q)));
      if (tri.value === "recent") l.sort((a, b) => (b.cree_le || "").localeCompare(a.cree_le || ""));
      if (tri.value === "modif") l.sort((a, b) => (b.modifie_le || "").localeCompare(a.modifie_le || ""));
      $("#liste").innerHTML = l.map((f) => carte(f, auteurs)).join("") || `<p class="discret">Aucun résultat.</p>`;
    };
    filtre.oninput = maj; tri.onchange = maj;
  };

  let fichesPourMenu = [];
  const enteteCat = (c, n, bouton) => `
    ${choixCategorie(c.id, fichesPourMenu)}
    <div class="entete-page">
      <div><h1><span class="ic-titre">${c.icone}</span>${esc(c.nom)}</h1>
      <p class="discret">${esc(c.description || "")} · ${n} fiche${n > 1 ? "s" : ""}</p></div>
      ${bouton}
    </div>`;

  pages.fiche = async (id) => {
    await majIndexTitres();
    const [f, auteurs, moments] = await Promise.all([api.lireFiche(id), auteursMap(), api.listerMoments({ ficheId: id })]);
    if (!f) return vide("Cette fiche n'existe pas (ou plus).", `<a class="btn" href="#/">Retour à l'accueil</a>`);
    const c = catParId(f.categorie);
    const a = auteurs.get(f.auteur_id);
    const infos = (f.infos || []).filter((i) => i.valeur);
    document.title = f.titre + " — " + CFG.NOM_SITE;
    return `
      <article class="fiche">
        <div class="fil"><a href="#/wiki">Wiki</a> › <a href="#/c/${c.id}">${esc(c.nom)}</a></div>
        <header class="fiche-entete">
          <div>
            <h1>${esc(f.titre)}</h1>
            ${f.resume ? `<p class="fiche-resume">${esc(f.resume)}</p>` : ""}
          </div>
          <div class="fiche-actions">
            <button class="btn petit btn-or" id="partager">📤 Partager</button>
            ${peutModifier(f) ? `<a class="btn petit" href="#/editer/${encodeURIComponent(f.id)}">Modifier</a><button class="btn petit btn-danger" id="suppr">Supprimer</button>` : ""}
          </div>
        </header>
        <div class="fiche-grille">
          ${urlSure(f.image_url) || infos.length || f.annee != null ? `
          <aside class="infobox">
            ${urlSure(f.image_url) ? `<img src="${esc(f.image_url)}" alt="${esc(f.titre)}">` : ""}
            <div class="infobox-titre">${c.icone} ${esc(c.nom)}</div>
            <dl>
              ${f.annee != null ? `<dt>Année</dt><dd>${esc(f.annee)}</dd>` : ""}
              ${infos.map((i) => `<dt>${esc(i.cle)}</dt><dd>${inline(esc(i.valeur))}</dd>`).join("")}
            </dl>
          </aside>` : ""}
          <div class="contenu">${markdown(f.contenu) || ((f.galerie || []).length ? "" : `<p class="discret">Cette fiche n'a pas encore de contenu.</p>`)}</div>
        </div>
        ${(f.galerie || []).length ? `
        <section class="galerie">
          <h2 class="titre-section">Galerie <span class="discret petit-texte">${f.galerie.length} image${f.galerie.length > 1 ? "s" : ""}</span></h2>
          <div class="galerie-grille">${f.galerie.map((g, i) => `
            <figure data-voir="${i}"><img src="${esc(g.url)}" alt="${esc(g.legende || "")}" loading="lazy">${g.legende ? `<figcaption>${esc(g.legende)}</figcaption>` : ""}</figure>`).join("")}
          </div>
        </section>` : ""}
        <section class="moments">
          <h2 class="titre-section">Moments marquants ${moments.length ? `<span class="discret petit-texte">${moments.length}</span>` : ""}</h2>
          ${estMembre() ? `
          <button class="btn btn-or" id="ouvrir-moment">+ Ajouter un moment marquant</button>
          <form class="form-moment panneau" id="form-moment" hidden>
            <label>Que s'est-il passé ?<textarea name="texte" rows="3" maxlength="2000" required placeholder="Ex : ${esc(f.titre)} a perdu son bras gauche face à la Raie des Brumes."></textarea></label>
            <label>Quand ? <span class="discret">(facultatif)</span><input name="quand" maxlength="60" placeholder="Ex : Session 4, An 812, Printemps…"></label>
            <div class="concernes">
              <span class="etiquette">Fiches concernées <span class="discret">(le moment s'affichera sur chacune)</span></span>
              <div class="puces" id="puces"></div>
              <input id="cherche-fiche" placeholder="+ Ajouter un autre personnage, un lieu…" autocomplete="off">
              <div class="suggestions" id="suggestions"></div>
            </div>
            <div class="rangee fin"><button type="button" class="btn" id="annuler-moment">Annuler</button><button class="btn btn-or">Enregistrer</button></div>
          </form>` : ""}
          ${moments.length ? `<ol class="journal">${moments.map((m) => htmlMoment(m, auteurs, f.id)).join("")}</ol>` : `<p class="discret">Aucun moment marquant pour l'instant.</p>`}
        </section>

        <footer class="fiche-pied">
          ${a ? `Créée par <a href="#/joueur/${encodeURIComponent(a.id)}">${esc(a.pseudo)}</a> · ` : ""}le ${dateFr(f.cree_le)}${f.modifie_le && f.modifie_le !== f.cree_le ? ` · modifiée le ${dateFr(f.modifie_le)}` : ""}
        </footer>
      </article>`;
  };
  pages.fiche.apres = async (id) => {
    brancherSuppressionMoments();
    $("#partager").onclick = async () => {
      const [f, auteurs] = await Promise.all([api.lireFiche(id), auteursMap()]);
      fenetrePartage(f, auteurs.get(f.auteur_id));
    };
    const fm = $("#form-moment");
    if (fm) {
      const choisies = [id];
      const puces = () => {
        $("#puces").innerHTML = choisies.map((fid) => { const x = indexParId.get(fid); return x ? `<span class="puce">${catParId(x.categorie).icone} ${esc(x.titre)}${fid === id ? "" : ` <button type="button" data-retirer="${esc(fid)}" aria-label="Retirer">✕</button>`}</span>` : ""; }).join("");
        $$("[data-retirer]", fm).forEach((b) => (b.onclick = () => { choisies.splice(choisies.indexOf(b.dataset.retirer), 1); puces(); }));
      };
      puces();
      const cherche = $("#cherche-fiche"), sugg = $("#suggestions");
      const proposer = () => {
        const q = normal(cherche.value);
        const res = [...indexParId.values()]
          .filter((x) => !choisies.includes(x.id) && (q ? normal(x.titre).includes(q) : x.categorie === "personnages"))
          .slice(0, 8);
        sugg.innerHTML = res.map((x) => `<button type="button" data-ajout="${esc(x.id)}">${catParId(x.categorie).icone} ${esc(x.titre)}</button>`).join("") || (q ? `<span class="discret petit-texte">Aucune fiche trouvée.</span>` : "");
        $$("[data-ajout]", sugg).forEach((b) => (b.onclick = () => { if (choisies.length < 30) choisies.push(b.dataset.ajout); cherche.value = ""; sugg.innerHTML = ""; puces(); }));
      };
      cherche.oninput = proposer;
      cherche.onfocus = proposer;
      $("#ouvrir-moment").onclick = () => { fm.hidden = false; $("#ouvrir-moment").hidden = true; fm.texte.focus(); };
      $("#annuler-moment").onclick = () => { fm.hidden = true; $("#ouvrir-moment").hidden = false; };
      fm.onsubmit = async (e) => {
        e.preventDefault();
        const b = $("button.btn-or", fm); b.disabled = true;
        try {
          await api.creerMoment({ texte: fm.texte.value, quand: fm.quand.value, fiches: choisies });
          toast(choisies.length > 1 ? `Moment ajouté sur ${choisies.length} fiches.` : "Moment ajouté.");
          router();
        } catch (err) { toast(err.message, "erreur"); b.disabled = false; }
      };
    }
    const figures = $$("[data-voir]");
    if (figures.length) {
      const f = await api.lireFiche(id);
      figures.forEach((fig) => (fig.onclick = () => visionneuse(f.galerie, +fig.dataset.voir)));
    }
    const b = $("#suppr");
    if (b) b.onclick = async () => {
      if (!confirm("Supprimer définitivement cette fiche ?")) return;
      const f = await api.lireFiche(id);
      try { await api.supprimerFiche(id); toast("Fiche supprimée."); location.hash = "#/c/" + f.categorie; }
      catch (e) { toast(e.message, "erreur"); }
    };
  };

  /* ---------- Éditeur ---------- */
  pages.editeur = async (id, params) => {
    if (!estMembre()) return pasMembre();
    let f = { categorie: params.get("cat") || "personnages", titre: params.get("titre") || "", resume: "", image_url: "", infos: [], contenu: "", annee: "", galerie: [] };
    if (id) {
      f = await api.lireFiche(id);
      if (!f) return vide("Fiche introuvable.");
      if (!peutModifier(f)) return vide("Tu ne peux modifier que tes propres fiches.");
    }
    if (!peutPublier(f.categorie)) f.categorie = (CATS.find((c) => peutPublier(c.id)) || CATS[0]).id;
    if (!id) f.infos = catParId(f.categorie).champs.map((cle) => ({ cle, valeur: "" }));
    pages.editeur.fiche = f;
    const cats = CATS.filter((c) => peutPublier(c.id) || c.id === f.categorie);
    return `
      <div class="entete-page"><div><div class="fil"><a href="#/">Accueil</a> › ${id ? "Modifier" : "Nouvelle fiche"}</div><h1>${id ? "Modifier la fiche" : "Nouvelle fiche"}</h1></div></div>
      <form class="editeur" id="editeur" autocomplete="off">
        <div class="ligne2">
          <label>Catégorie<select name="categorie">${cats.map((c) => `<option value="${c.id}" ${c.id === f.categorie ? "selected" : ""}>${c.icone} ${esc(c.nom)}</option>`).join("")}</select></label>
          <label>Titre *<input name="titre" required maxlength="120" value="${esc(f.titre)}" placeholder="Nom du personnage, du lieu…"></label>
        </div>
        <label>Résumé <span class="discret">(une phrase, affichée sur les cartes)</span><textarea name="resume" rows="2" maxlength="400">${esc(f.resume || "")}</textarea></label>
        <label id="champ-annee" ${catParId(f.categorie).chronologie ? "" : "hidden"}>Année <span class="discret">(pour la frise)</span><input name="annee" type="number" value="${esc(f.annee ?? "")}"></label>

        <fieldset><legend>Image</legend>
          <div class="image-zone">
            <div class="image-apercu" id="image-apercu">${urlSure(f.image_url) ? `<img src="${esc(f.image_url)}" alt="">` : "<span>Aucune image</span>"}</div>
            <div class="image-ctrl">
              <input name="image_url" placeholder="Colle l'adresse d'une image (https://…)" value="${esc(f.image_url || "")}">
              <div class="rangee"><label class="btn petit">Envoyer une image<input type="file" id="fichier-image" accept="image/*" hidden></label><button type="button" class="btn petit" id="retirer-image">Retirer</button></div>
            </div>
          </div>
        </fieldset>

        <fieldset><legend>Galerie</legend>
          <p class="discret">Tenues, illustrations, croquis, cartes… Ajoute autant d'images que tu veux (jusqu'à 100), avec une légende pour chacune.</p>
          <div class="galerie-edit" id="galerie-edit"></div>
          <label class="btn btn-or petit bouton-ajout-img">+ Ajouter des images<input type="file" id="fichiers-galerie" accept="image/*" multiple hidden></label>
          <span class="discret petit-texte" id="galerie-etat"></span>
        </fieldset>

        <fieldset><legend>Infos rapides</legend>
          <p class="discret">Les cases vides ne s'affichent pas. Tu peux renommer, retirer ou ajouter des cases.</p>
          <div id="infos"></div>
          <button type="button" class="btn petit" id="ajout-info">+ Ajouter une case</button>
        </fieldset>

        <fieldset><legend>Contenu</legend>
          <div class="onglets"><button type="button" class="onglet actif" data-o="ecrire">Écrire</button><button type="button" class="onglet" data-o="apercu">Aperçu</button></div>
          <div class="outils">
            <button type="button" data-md="**|**" title="Gras"><b>G</b></button>
            <button type="button" data-md="*|*" title="Italique"><i>I</i></button>
            <button type="button" data-md="\n## |" title="Titre">Titre</button>
            <button type="button" data-md="\n- |" title="Liste">• Liste</button>
            <button type="button" data-md="\n> |" title="Citation">❝</button>
            <button type="button" data-md="[[|]]" title="Lien vers une autre fiche">[[Lien]]</button>
            <label class="btn-outil" title="Insérer une image dans le texte">🖼 Image<input type="file" id="image-texte" accept="image/*" hidden></label>
            <button type="button" id="bouton-couleurs" title="Couleur du texte">🎨 Couleur</button>
          </div>
          <div class="palette" id="palette" hidden>
            <span class="discret petit-texte">Sélectionne du texte, puis choisis une couleur :</span>
            <div class="pastilles">${COULEURS.map(([nom, hex]) => `<button type="button" class="pastille" data-couleur="${nom}" title="${nom}" style="background:${hex}"></button>`).join("")}</div>
          </div>
          <textarea name="contenu" id="contenu" rows="16" placeholder="Raconte tout ici…">${esc(f.contenu || "")}</textarea>
          <div class="contenu apercu" id="apercu" hidden></div>
          <details class="aide"><summary>Aide à la mise en forme</summary>
            <ul>
              <li><code>## Titre</code> — un intertitre</li>
              <li><code>**gras**</code>, <code>*italique*</code>, <code>~~barré~~</code></li>
              <li><code>- élément</code> — une liste ; <code>1. élément</code> — liste numérotée</li>
              <li><code>&gt; texte</code> — une citation</li>
              <li><code>[[Nom d'une fiche]]</code> — lien vers une autre fiche du site (en rouge si elle n'existe pas encore)</li>
              <li><code>[texte](https://…)</code> — lien externe</li>
              <li>Bouton <b>🖼 Image</b> — envoie une image et la place dans le texte, là où est le curseur</li>
              <li><code>---</code> — une ligne de séparation</li>
              <li><code>[rouge]texte[/rouge]</code> — texte en couleur (bouton 🎨). Couleurs : ${COULEURS.map((c) => `<span class="c-${c[0]}">${c[0]}</span>`).join(", ")}</li>
            </ul>
          </details>
        </fieldset>

        <div class="rangee fin">
          <a class="btn" href="${id ? "#/f/" + encodeURIComponent(id) : "#/"}">Annuler</a>
          <button class="btn btn-or" type="submit" id="enregistrer">${id ? "Enregistrer" : "Publier"}</button>
        </div>
      </form>`;
  };
  pages.editeur.apres = (id) => {
    const form = $("#editeur");
    if (!form) return;
    const f = pages.editeur.fiche;
    const zoneInfos = $("#infos");
    const ligneInfo = (i) => `<div class="info-ligne"><input class="cle" placeholder="Nom" value="${esc(i.cle)}"><input class="valeur" placeholder="…" value="${esc(i.valeur)}"><button type="button" class="retirer" title="Retirer">✕</button></div>`;
    const dessinerInfos = (infos) => {
      zoneInfos.innerHTML = infos.map(ligneInfo).join("");
      $$(".retirer", zoneInfos).forEach((b) => (b.onclick = () => b.parentElement.remove()));
    };
    const lireInfos = () => $$(".info-ligne", zoneInfos).map((l) => ({ cle: $(".cle", l).value, valeur: $(".valeur", l).value }));
    dessinerInfos(f.infos || []);
    $("#ajout-info").onclick = () => { zoneInfos.insertAdjacentHTML("beforeend", ligneInfo({ cle: "", valeur: "" })); const l = zoneInfos.lastElementChild; $(".retirer", l).onclick = () => l.remove(); $(".cle", l).focus(); };

    form.categorie.onchange = () => {
      const c = catParId(form.categorie.value);
      $("#champ-annee").hidden = !c.chronologie;
      const remplies = lireInfos().filter((i) => i.valeur.trim());
      const cles = new Set(remplies.map((i) => normal(i.cle)));
      dessinerInfos([...remplies, ...c.champs.filter((k) => !cles.has(normal(k))).map((cle) => ({ cle, valeur: "" }))]);
    };

    const apercuImg = () => { const u = form.image_url.value.trim(); $("#image-apercu").innerHTML = urlSure(u) ? `<img src="${esc(u)}" alt="">` : "<span>Aucune image</span>"; };
    form.image_url.oninput = apercuImg;
    $("#retirer-image").onclick = () => { form.image_url.value = ""; apercuImg(); };
    $("#fichier-image").onchange = async (e) => {
      const fichier = e.target.files[0];
      if (!fichier) return;
      $("#image-apercu").innerHTML = "<span>Envoi…</span>";
      try { form.image_url.value = await api.envoyerImage(fichier); apercuImg(); toast("Image envoyée."); }
      catch (err) { toast(err.message, "erreur"); apercuImg(); }
    };

    let modifie = false;
    /* Galerie */
    let galerie = [...(f.galerie || [])];
    const zoneGal = $("#galerie-edit");
    const dessinerGalerie = () => {
      zoneGal.innerHTML = galerie.map((g, i) => `
        <div class="gal-item">
          <img src="${esc(g.url)}" alt="">
          <input class="gal-legende" data-i="${i}" placeholder="Légende (ex : tenue de bal)" value="${esc(g.legende || "")}" maxlength="200">
          <div class="gal-actions">
            <button type="button" data-gauche="${i}" title="Déplacer avant" ${i === 0 ? "disabled" : ""}>←</button>
            <button type="button" data-principale="${i}" title="Utiliser comme image principale">★</button>
            <button type="button" data-droite="${i}" title="Déplacer après" ${i === galerie.length - 1 ? "disabled" : ""}>→</button>
            <button type="button" class="suppr" data-suppr="${i}" title="Retirer">✕</button>
          </div>
        </div>`).join("");
      $$(".gal-legende", zoneGal).forEach((x) => (x.oninput = () => (galerie[+x.dataset.i].legende = x.value)));
      const bouger = (i, j) => { [galerie[i], galerie[j]] = [galerie[j], galerie[i]]; dessinerGalerie(); };
      $$("[data-gauche]", zoneGal).forEach((b) => (b.onclick = () => bouger(+b.dataset.gauche, +b.dataset.gauche - 1)));
      $$("[data-droite]", zoneGal).forEach((b) => (b.onclick = () => bouger(+b.dataset.droite, +b.dataset.droite + 1)));
      $$("[data-suppr]", zoneGal).forEach((b) => (b.onclick = () => { galerie.splice(+b.dataset.suppr, 1); dessinerGalerie(); modifie = true; }));
      $$("[data-principale]", zoneGal).forEach((b) => (b.onclick = () => { form.image_url.value = galerie[+b.dataset.principale].url; apercuImg(); toast("Image principale choisie."); }));
    };
    dessinerGalerie();
    $("#fichiers-galerie").onchange = async (e) => {
      const fichiers = [...e.target.files];
      e.target.value = "";
      let n = 0;
      for (const fi of fichiers) {
        if (galerie.length >= 100) { toast("100 images maximum par fiche.", "erreur"); break; }
        $("#galerie-etat").textContent = `Envoi ${++n} / ${fichiers.length}…`;
        try {
          const url = await api.envoyerImage(fi);
          galerie.push({ url, legende: fi.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/^(IMG|DSC|PXL|Screenshot)\s?\d.*$/i, "") });
          dessinerGalerie(); modifie = true;
        } catch (err) { toast(fi.name + " : " + err.message, "erreur"); }
      }
      $("#galerie-etat").textContent = "";
    };

    const ta = $("#contenu");
    $("#image-texte").onchange = async (e) => {
      const fi = e.target.files[0];
      e.target.value = "";
      if (!fi) return;
      toast("Envoi de l'image…");
      try {
        const url = await api.envoyerImage(fi);
        const pos = ta.selectionStart;
        ta.setRangeText(`\n![](${url})\n`, pos, ta.selectionEnd, "end");
        modifie = true;
      } catch (err) { toast(err.message, "erreur"); }
    };
    $$(".outils button").forEach((b) => (b.onclick = () => {
      const [avant, apres] = b.dataset.md.replace(/\\n/g, "\n").split("|");
      const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
      ta.setRangeText(avant + sel + apres, s, e, "end");
      ta.selectionStart = ta.selectionEnd = s + avant.length + sel.length;
      ta.focus();
    }));
    $("#bouton-couleurs").onclick = () => ($("#palette").hidden = !$("#palette").hidden);
    $$("[data-couleur]").forEach((b) => (b.onclick = () => {
      const c = b.dataset.couleur;
      const s0 = ta.selectionStart, e0 = ta.selectionEnd, sel = ta.value.slice(s0, e0) || "texte";
      ta.setRangeText(`[${c}]${sel}[/${c}]`, s0, e0, "end");
      ta.selectionStart = s0 + c.length + 2; ta.selectionEnd = ta.selectionStart + sel.length;
      ta.focus(); modifie = true;
    }));
    $$(".onglet").forEach((o) => (o.onclick = () => {
      $$(".onglet").forEach((x) => x.classList.toggle("actif", x === o));
      const ap = o.dataset.o === "apercu";
      ta.hidden = ap; $(".outils").hidden = ap; $("#apercu").hidden = !ap; if (ap) $("#palette").hidden = true;
      if (ap) $("#apercu").innerHTML = markdown(ta.value) || `<p class="discret">Rien à afficher.</p>`;
    }));

    form.oninput = () => (modifie = true);
    window.onbeforeunload = () => (modifie ? true : undefined);

    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#enregistrer");
      btn.disabled = true;
      const data = { categorie: form.categorie.value, titre: form.titre.value, resume: form.resume.value, image_url: form.image_url.value, infos: lireInfos(), contenu: ta.value, annee: form.annee.value, galerie };
      if (data.image_url && !urlSure(data.image_url)) { toast("L'adresse de l'image doit commencer par https://", "erreur"); btn.disabled = false; return; }
      try {
        const nouvelId = id ? (await api.modifierFiche(id, data), id) : await api.creerFiche(data);
        modifie = false; window.onbeforeunload = null;
        toast(id ? "Fiche enregistrée." : "Fiche publiée !");
        location.hash = "#/f/" + encodeURIComponent(nouvelId);
      } catch (err) { toast(err.message, "erreur"); btn.disabled = false; }
    };
  };

  function pasMembre() {
    const m = moi();
    if (!m) return vide("Tu dois être connecté pour publier.", `<a class="btn btn-or" href="#/connexion">Se connecter</a>`);
    if (role() === "banni") return vide("Ton compte a été suspendu par un administrateur.");
    return vide("Ton compte n'a pas encore accès à la publication. Il te faut un lien d'invitation.", `<a class="btn" href="#/compte">Entrer un code</a>`);
  }

  /* ---------- Recherche ---------- */
  pages.recherche = async (_, params) => {
    const q = params.get("q") || "";
    const [fiches, auteurs] = await Promise.all([majIndexTitres(), auteursMap()]);
    const nq = normal(q);
    const res = nq ? fiches.filter((f) => normal([f.titre, f.resume, ...(f.infos || []).map((i) => i.valeur)].join(" ")).includes(nq))
      .sort((a, b) => (normal(b.titre).includes(nq) ? 1 : 0) - (normal(a.titre).includes(nq) ? 1 : 0)) : [];
    return `
      <div class="entete-page"><div><h1>Recherche</h1></div></div>
      <form class="filtres" id="form-r"><input type="search" name="q" value="${esc(q)}" placeholder="Nom, lieu, créature…"><button class="btn">Chercher</button></form>
      ${q ? `<p class="discret">${res.length} résultat${res.length > 1 ? "s" : ""} pour « ${esc(q)} »</p>` : ""}
      <div class="grille">${res.map((f) => carte(f, auteurs)).join("")}</div>
      ${q && !res.length ? vide("Aucune fiche trouvée.", peutPublier("personnages") ? `<a class="btn" href="#/nouveau?titre=${encodeURIComponent(q)}">Créer « ${esc(q)} »</a>` : "") : ""}`;
  };
  pages.recherche.apres = () => { const f = $("#form-r"); if (f) f.onsubmit = (e) => { e.preventDefault(); location.hash = "#/recherche?q=" + encodeURIComponent(f.q.value.trim()); }; };

  /* ---------- Joueurs ---------- */
  pages.joueurs = async () => {
    const [fiches, profils] = await Promise.all([api.listerFiches(), api.listerProfils()]);
    const actifs = profils.filter((p) => p.role !== "banni");
    return `
      <div class="entete-page"><div><h1><span class="ic-titre">☺</span>Joueurs</h1><p class="discret">${actifs.length} membre${actifs.length > 1 ? "s" : ""}</p></div></div>
      <div class="liste-joueurs">${actifs.map((p) => {
        const n = fiches.filter((f) => f.auteur_id === p.id).length;
        const perso = fiches.filter((f) => f.auteur_id === p.id && f.categorie === "personnages").length;
        return `<a class="joueur" href="#/joueur/${encodeURIComponent(p.id)}"><span class="avatar">${esc(p.pseudo.charAt(0).toUpperCase())}</span><span><b>${esc(p.pseudo)}</b>${p.role === "admin" ? ' <span class="badge-admin">admin</span>' : ""}<br><small class="discret">${n} fiche${n > 1 ? "s" : ""} · ${perso} personnage${perso > 1 ? "s" : ""}</small></span></a>`;
      }).join("")}</div>`;
  };

  pages.joueur = async (id) => {
    const [fiches, auteurs] = await Promise.all([majIndexTitres(), auteursMap()]);
    const p = auteurs.get(id);
    if (!p) return vide("Joueur introuvable.");
    const siennes = fiches.filter((f) => f.auteur_id === id);
    const parCat = CATS.map((c) => [c, siennes.filter((f) => f.categorie === c.id)]).filter(([, l]) => l.length);
    return `
      <div class="entete-page"><div><div class="fil"><a href="#/joueurs">Joueurs</a> › ${esc(p.pseudo)}</div><h1>${esc(p.pseudo)}</h1><p class="discret">Membre depuis le ${dateFr(p.cree_le)} · ${siennes.length} fiche${siennes.length > 1 ? "s" : ""}</p></div></div>
      ${parCat.map(([c, l]) => `<h2 class="titre-section">${c.icone} ${esc(c.nom)}</h2><div class="grille">${l.map((f) => carte(f, auteurs)).join("")}</div>`).join("") || vide("Ce joueur n'a encore rien publié.")}`;
  };

  /* ---------- Connexion / inscription / compte ---------- */
  pages.connexion = async () => {
    if (moi()) { location.hash = "#/compte"; return ""; }
    if (api.mode === "demo") return `
      <div class="boite-auth"><h1>Connexion</h1><p>En mode démo, pas besoin de mot de passe : tu entres directement en tant qu'admin.</p>
      <button class="btn btn-or large" id="demo-co">Entrer (démo)</button></div>`;
    return `
      <form class="boite-auth" id="form-co">
        <h1>Connexion</h1>
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Mot de passe<input name="mdp" type="password" required autocomplete="current-password"></label>
        <button class="btn btn-or large">Se connecter</button>
        <button type="button" class="lien" id="oubli">Mot de passe oublié ?</button>
        <p class="discret petit-texte">Pas de compte ? L'inscription se fait uniquement avec un lien d'invitation donné par un admin.</p>
      </form>`;
  };
  pages.connexion.apres = () => {
    const d = $("#demo-co");
    if (d) d.onclick = async () => { await api.connecter({}); location.hash = "#/"; };
    const f = $("#form-co");
    if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api.connecter({ email: f.email.value.trim(), mdp: f.mdp.value }); toast("Bon retour sur " + CFG.NOM_SITE + " !"); location.hash = "#/"; }
      catch (err) { toast(err.message, "erreur"); }
    };
    $("#oubli").onclick = async () => {
      const email = f.email.value.trim() || prompt("Ton adresse email :");
      if (!email) return;
      try { await api.motDePasseOublie(email); toast("Email envoyé : suis le lien pour choisir un nouveau mot de passe."); }
      catch (err) { toast(err.message, "erreur"); }
    };
  };

  pages.inscription = async (_, params) => {
    const code = params.get("invite") || "";
    if (moi() && moi().profil) return vide(`Tu es déjà inscrit en tant que <b>${esc(moi().profil.pseudo)}</b>.`, `<a class="btn" href="#/">Accueil</a>`);
    const ok = await api.verifierInvitation(code);
    if (!ok) return vide(code ? "Ce lien d'invitation n'est pas (ou plus) valide. Demande un nouveau lien à un admin." : "L'inscription se fait uniquement avec un lien d'invitation. Demande-en un à un admin.");
    return `
      <form class="boite-auth" id="form-ins">
        <h1>Rejoindre ${esc(CFG.NOM_SITE)}</h1>
        <p class="discret">Tu as été invité ! Crée ton compte pour publier tes fiches.</p>
        ${api.mode === "demo" ? `<p class="note">Démo : ceci simule l'arrivée d'un nouveau joueur. Tu seras connecté avec ce nouveau compte (réinitialise la démo pour redevenir admin).</p>` : ""}
        <label>Pseudo<input name="pseudo" required minlength="2" maxlength="30" autocomplete="nickname"></label>
        ${api.mode === "demo" ? "" : `<label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Mot de passe <span class="discret">(8 caractères min.)</span><input name="mdp" type="password" required minlength="8" autocomplete="new-password"></label>`}
        <input type="hidden" name="invite" value="${esc(code)}">
        <button class="btn btn-or large">Créer mon compte</button>
      </form>`;
  };
  pages.inscription.apres = () => {
    const f = $("#form-ins");
    if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = $("button", f); b.disabled = true;
      try {
        const r = await api.inscrire({ email: f.email ? f.email.value.trim() : "", mdp: f.mdp ? f.mdp.value : "", pseudo: f.pseudo.value.trim(), invite: f.invite.value });
        if (r.confirmationRequise) {
          f.innerHTML = `<h1>Presque fini !</h1><p>Un email de confirmation t'a été envoyé. Clique sur le lien dedans, puis connecte-toi : ton compte sera activé automatiquement.</p><a class="btn" href="#/connexion">Aller à la connexion</a>`;
        } else { toast("Bienvenue sur " + CFG.NOM_SITE + " !"); location.hash = "#/"; }
      } catch (err) { toast(err.message, "erreur"); b.disabled = false; }
    };
  };

  pages.compte = async () => {
    const m = moi();
    if (!m) { location.hash = "#/connexion"; return ""; }
    return `
      <div class="entete-page"><div><h1>${m.profil ? esc(m.profil.pseudo) : "Mon compte"}</h1><p class="discret">${api.mode === "demo" ? "Mode démo" : esc(m.user.email)}</p></div></div>
      <div class="colonnes">
        ${m.profil ? `
        <form class="panneau" id="form-pseudo"><h2>Pseudo</h2><input name="pseudo" value="${esc(m.profil.pseudo)}" minlength="2" maxlength="30" required><button class="btn">Changer</button></form>
        ${api.mode === "demo" ? "" : `<form class="panneau" id="form-mdp"><h2>Mot de passe</h2><input name="mdp" type="password" minlength="8" placeholder="Nouveau mot de passe" required autocomplete="new-password"><button class="btn">Changer</button></form>`}
        <div class="panneau"><h2>Mes fiches</h2><a class="btn" href="#/joueur/${encodeURIComponent(m.user.id)}">Voir mes fiches</a></div>
        ${estAdmin() ? `<div class="panneau"><h2>Administration</h2><a class="btn" href="#/admin">Inviter des joueurs / gérer les membres</a></div>` : ""}`
        : `<form class="panneau" id="form-code"><h2>Activer mon compte</h2>
            ${m.erreurProfil ? `<p class="note">${esc(m.erreurProfil)}</p>` : ""}
            <p class="discret">Colle le lien ou le code d'invitation reçu d'un admin.</p>
            <input name="code" placeholder="Lien ou code" required><input name="pseudo" placeholder="Pseudo" minlength="2" maxlength="30" required><button class="btn btn-or">Activer</button></form>`}
      </div>
      <button class="btn btn-danger" id="deco">Se déconnecter</button>`;
  };
  pages.compte.apres = () => {
    const fp = $("#form-pseudo");
    if (fp) fp.onsubmit = async (e) => { e.preventDefault(); try { await api.changerPseudo(fp.pseudo.value); toast("Pseudo changé."); entete(); } catch (err) { toast(err.message, "erreur"); } };
    const fm = $("#form-mdp");
    if (fm) fm.onsubmit = async (e) => { e.preventDefault(); try { await api.changerMotDePasse(fm.mdp.value); fm.reset(); toast("Mot de passe changé."); } catch (err) { toast(err.message, "erreur"); } };
    const fc = $("#form-code");
    if (fc) fc.onsubmit = async (e) => {
      e.preventDefault();
      const brut = fc.code.value.trim();
      const code = (brut.match(/invite=([^&#\s]+)/) || [, brut])[1];
      try { await api.rejoindreAvecCode(decodeURIComponent(code), fc.pseudo.value.trim()); toast("Compte activé !"); location.hash = "#/"; }
      catch (err) { toast(err.message, "erreur"); }
    };
    $("#deco").onclick = async () => { await api.deconnecter(); toast("À bientôt !"); location.hash = "#/"; };
  };

  /* ---------- Administration ---------- */
  pages.admin = async () => {
    if (!estAdmin()) return vide("Réservé aux administrateurs.");
    const [invitations, profils, fiches] = await Promise.all([api.listerInvitations(), api.listerProfils(true), api.listerFiches()]);
    const etat = (i) => {
      if (i.expire_le && new Date(i.expire_le) < new Date()) return ["expirée", "off"];
      if (i.max_utilisations != null && i.utilisations >= i.max_utilisations) return ["épuisée", "off"];
      return ["active", "on"];
    };
    return `
      <div class="entete-page"><div><h1><span class="ic-titre">⚙</span>Administration</h1><p class="discret">${profils.length} membres · ${fiches.length} fiches · ${invitations.filter((i) => etat(i)[1] === "on").length} invitations actives</p></div></div>

      <section class="panneau">
        <h2>Inviter des joueurs</h2>
        <p class="discret">Crée un lien et envoie-le (Discord, message…). La personne pourra créer son compte et publier directement.</p>
        <form id="form-inv" class="form-inv">
          <label>Pour qui ? <span class="discret">(note pour toi)</span><input name="note" placeholder="ex : Lucas, ou « serveur Discord »" maxlength="80"></label>
          <label>Nombre d'utilisations<select name="max"><option value="1">1 personne</option><option value="5">5 personnes</option><option value="20">20 personnes</option><option value="">Illimité</option></select></label>
          <label>Valable<select name="jours"><option value="7">7 jours</option><option value="1">24 heures</option><option value="30">30 jours</option><option value="">Toujours</option></select></label>
          <button class="btn btn-or">Créer le lien</button>
        </form>
        <div id="nouveau-lien"></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Pour</th><th>Utilisé</th><th>Expire</th><th>État</th><th></th></tr></thead>
          <tbody>${invitations.map((i) => { const [t, c] = etat(i); return `<tr>
            <td>${esc(i.note || "—")}</td>
            <td>${i.utilisations}${i.max_utilisations != null ? " / " + i.max_utilisations : " / ∞"}</td>
            <td>${i.expire_le ? dateFr(i.expire_le) : "jamais"}</td>
            <td><span class="etat etat-${c}">${t}</span></td>
            <td class="actions">${c === "on" ? `<button class="btn petit" data-copier="${esc(i.code)}">Copier</button>` : ""}<button class="btn petit btn-danger" data-suppr-inv="${esc(i.code)}">✕</button></td></tr>`; }).join("") || `<tr><td colspan="5" class="discret">Aucune invitation.</td></tr>`}</tbody>
        </table></div>
      </section>

      <section class="panneau">
        <h2>Membres</h2>
        <p class="discret"><b>Admin</b> : tout gérer · <b>Membre</b> : publier et modifier ses fiches · <b>Banni</b> : ne peut plus rien publier.</p>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Pseudo</th><th>Fiches</th><th>Depuis</th><th>Rôle</th></tr></thead>
          <tbody>${profils.map((p) => `<tr>
            <td><a href="#/joueur/${encodeURIComponent(p.id)}">${esc(p.pseudo)}</a></td>
            <td>${fiches.filter((f) => f.auteur_id === p.id).length}</td>
            <td>${dateFr(p.cree_le)}</td>
            <td>${p.id === moi().user.id ? "admin (toi)" : `<select data-role="${esc(p.id)}">${["membre", "admin", "banni"].map((r) => `<option ${r === p.role ? "selected" : ""}>${r}</option>`).join("")}</select>`}</td></tr>`).join("")}</tbody>
        </table></div>
      </section>`;
  };
  pages.admin.apres = () => {
    const f = $("#form-inv");
    if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const inv = await api.creerInvitation({ note: f.note.value.trim(), max: f.max.value, jours: f.jours.value ? +f.jours.value : null });
        const lien = lienInvitation(inv.code);
        await router();
        $("#nouveau-lien").innerHTML = `<div class="lien-cree"><p><b>Lien créé !</b> Envoie-le à ${esc(inv.note || "ton joueur")} :</p><input readonly value="${esc(lien)}" onclick="this.select()"><div class="rangee"><button class="btn btn-or" id="copier-nouveau">Copier</button>${navigator.share ? `<button class="btn" id="partager-nouveau">Partager…</button>` : ""}</div></div>`;
        $("#copier-nouveau").onclick = () => copier(lien);
        const ps = $("#partager-nouveau");
        if (ps) ps.onclick = () => navigator.share({ title: "Invitation — " + CFG.NOM_SITE, text: "Rejoins " + CFG.NOM_SITE + " :", url: lien }).catch(() => {});
        $("#nouveau-lien").scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (err) { toast(err.message, "erreur"); }
    };
    $$("[data-copier]").forEach((b) => (b.onclick = () => copier(lienInvitation(b.dataset.copier))));
    $$("[data-suppr-inv]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Supprimer ce lien ? Il ne fonctionnera plus.")) return;
      try { await api.supprimerInvitation(b.dataset.supprInv); router(); } catch (err) { toast(err.message, "erreur"); }
    }));
    $$("[data-role]").forEach((s) => (s.onchange = async () => {
      try { await api.changerRole(s.dataset.role, s.value); toast("Rôle mis à jour."); } catch (err) { toast(err.message, "erreur"); }
    }));
  };

  /* ---------------- Routeur ---------------- */
  async function router() {
    const brut = location.hash.replace(/^#/, "") || "/";
    const [chemin, qs] = brut.split("?");
    const params = new URLSearchParams(qs || "");
    const morceaux = chemin.split("/").filter(Boolean).map(decodeURIComponent);
    const routes = {
      "": [pages.accueil], wiki: [pages.wiki], c: [pages.categorie], f: [pages.fiche], nouveau: [pages.editeur], editer: [pages.editeur],
      recherche: [pages.recherche], joueurs: [pages.joueurs], joueur: [pages.joueur], connexion: [pages.connexion],
      inscription: [pages.inscription], compte: [pages.compte], admin: [pages.admin],
    };
    const [page] = routes[morceaux[0] || ""] || [null];
    const arg = morceaux[0] === "nouveau" ? null : morceaux[1];
    window.onbeforeunload = null;
    document.title = CFG.NOM_SITE;
    entete();
    if (!page) { app.innerHTML = vide("Page introuvable.", `<a class="btn" href="#/">Accueil</a>`); return; }
    app.classList.add("chargement");
    try {
      app.innerHTML = await page(arg, params);
      if (page.apres) page.apres(arg, params);
    } catch (e) {
      console.error(e);
      app.innerHTML = vide("Oups, une erreur est survenue : " + esc(e.message), `<button class="btn" onclick="location.reload()">Recharger</button>`);
    }
    app.classList.remove("chargement");
    window.scrollTo(0, 0);
  }

  let ignorerProchain = false;
  window.addEventListener("hashchange", () => {
    if (ignorerProchain) { ignorerProchain = false; return; }
    if (window.onbeforeunload && window.onbeforeunload() && !confirm("Quitter sans enregistrer tes modifications ?")) {
      ignorerProchain = true;
      history.back();
      return;
    }
    router();
  });

  (async () => {
    try { await api.init(); }
    catch (e) { console.error(e); app.innerHTML = vide("Impossible de se connecter à la base de données. Vérifie <code>config.js</code>."); return; }
    api.onChange(() => entete());
    router();
  })();
})();

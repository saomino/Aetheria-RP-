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
      route.startsWith("/recherche") ? "wiki" :
      route.startsWith("/des") ? "des" :
      route.startsWith("/ia") || route.startsWith("/creer-ia") ? "wiki" :
      /^\/(joueurs|joueur)/.test(route) ? "joueurs" :
      route.startsWith("/roue") ? "roue" :
      route.startsWith("/jeux") ? "jeux" : "moi";
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
      ["des", "#/des", "🎲", "Dés"],
      ["roue", "#/roue", "🎡", "Roue"],
      ["jeux", "#/jeux", "🎮", "Jeux"],
      ["joueurs", "#/joueurs", "👥", "Joueurs"],
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

  /* ---------------- Import d'un fichier (Word, PDF, texte) ---------------- */

  // Lecture d'un .zip (un .docx est un zip) sans bibliothèque externe
  async function lireZip(buffer) {
    const dv = new DataView(buffer), u8 = new Uint8Array(buffer);
    let fin = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Error("Fichier Word illisible ou abîmé.");
    const nb = dv.getUint16(fin + 10, true);
    let p = dv.getUint32(fin + 16, true);
    const fichiers = {};
    const dec = new TextDecoder();
    for (let k = 0; k < nb; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const methode = dv.getUint16(p + 10, true), taille = dv.getUint32(p + 20, true);
      const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const nom = dec.decode(u8.subarray(p + 46, p + 46 + ln));
      fichiers[nom] = async () => {
        const debut = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const brut = u8.subarray(debut, debut + taille);
        if (methode === 0) return brut;
        if (methode !== 8) throw new Error("Compression non prise en charge.");
        if (typeof DecompressionStream === "undefined") throw new Error("Ton navigateur est trop ancien pour lire les fichiers Word. Mets-le à jour ou utilise un fichier .txt.");
        const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(flux).arrayBuffer());
      };
      p += 46 + ln + le + lc;
    }
    return fichiers;
  }

  // Couleur Word → couleur du site la plus proche (le noir/blanc par défaut sont ignorés)
  function couleurProche(hex) {
    if (!/^[0-9a-f]{6}$/i.test(hex || "")) return null;
    const rgb = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16));
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    const sat = Math.max(...rgb) - Math.min(...rgb);
    if (lum < 0.2 || (lum > 0.93 && sat < 30)) return null;
    let best = null, d = Infinity;
    for (const [nom, h] of COULEURS) {
      if (nom === "noir" || nom === "blanc") continue;
      const c = [0, 2, 4].map((i) => parseInt(h.substr(1 + i, 2), 16));
      const dist = c.reduce((t, v, i) => t + (v - rgb[i]) ** 2, 0);
      if (dist < d) { d = dist; best = nom; }
    }
    return best;
  }

  async function docxVersTexte(buffer) {
    const zip = await lireZip(buffer);
    if (!zip["word/document.xml"]) throw new Error("Ce n'est pas un fichier Word (.docx) valide.");
    const dec = new TextDecoder();
    const xml = (u8) => new DOMParser().parseFromString(dec.decode(u8), "application/xml");
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const doc = xml(await zip["word/document.xml"]());
    const rels = {};
    if (zip["word/_rels/document.xml.rels"]) {
      const r = xml(await zip["word/_rels/document.xml.rels"]());
      [...r.getElementsByTagName("Relationship")].forEach((x) => (rels[x.getAttribute("Id")] = x.getAttribute("Target")));
    }
    const enfants = (el, nom) => [...el.childNodes].filter((n) => n.localName === nom);
    const enfant = (el, nom) => el && enfants(el, nom)[0];
    const val = (el) => el && (el.getAttributeNS(W, "val") || el.getAttribute("w:val"));
    const actif = (el) => !!el && !["0", "false", "none"].includes(val(el) || "");
    const images = [];

    const runs = (p) => {
      const segs = [];
      const parcourir = (el) => {
        for (const n of el.childNodes) {
          if (n.localName === "r") {
            const pr = enfant(n, "rPr");
            const st = { b: actif(enfant(pr, "b")), i: actif(enfant(pr, "i")), c: couleurProche(val(enfant(pr, "color"))) };
            for (const x of n.childNodes) {
              if (x.localName === "t") segs.push({ ...st, t: x.textContent });
              else if (x.localName === "tab") segs.push({ ...st, t: " " });
              else if (x.localName === "br" || x.localName === "cr") segs.push({ t: "\n" });
              else if (x.localName === "drawing" || x.localName === "pict") {
                const blip = x.getElementsByTagNameNS("*", "blip")[0] || x.getElementsByTagNameNS("*", "imagedata")[0];
                const id = blip && (blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || blip.getAttribute("r:embed") || blip.getAttribute("r:id"));
                if (id && rels[id]) { images.push(rels[id]); segs.push({ t: `\n%%IMG${images.length - 1}%%\n` }); }
              }
            }
          } else if (["hyperlink", "ins", "smartTag", "sdt", "sdtContent", "fldSimple"].includes(n.localName)) parcourir(n);
        }
      };
      parcourir(p);
      // fusionner les morceaux qui ont la même mise en forme
      const fus = [];
      for (const x of segs) {
        const der = fus[fus.length - 1];
        if (der && der.b === x.b && der.i === x.i && der.c === x.c && !x.t.includes("%%") && !der.t.includes("%%")) der.t += x.t;
        else fus.push({ ...x });
      }
      return fus.map((x) => {
        if (!x.t.trim() || x.t.includes("%%")) return x.t;
        const m = x.t.match(/^(\s*)([\s\S]*?)(\s*)$/);
        let t = m[2];
        if (x.i) t = `*${t}*`;
        if (x.b) t = `**${t}**`;
        if (x.c) t = `[${x.c}]${t}[/${x.c}]`;
        return m[1] + t + m[3];
      }).join("");
    };

    const lignes = [];
    let titre = null;
    const corps = doc.getElementsByTagNameNS(W, "body")[0] || doc.documentElement;
    const traiter = (el) => {
      for (const n of el.childNodes) {
        if (n.localName === "p") {
          const pPr = enfant(n, "pPr");
          const style = (val(enfant(pPr, "pStyle")) || "").toLowerCase();
          const texte = runs(n);
          const net = texte.replace(/%%IMG\d+%%/g, "").trim();
          const niv = style.match(/^(?:heading|titre|title|berschrift|kop)\s*(\d)?$/);
          if (niv && net && !texte.includes("%%IMG")) {
            const sansForme = sansMarkdown(net);
            if (!titre && (style.startsWith("title") || style === "titre" || niv[1] === "1")) { titre = sansForme; lignes.push(""); continue; }
            lignes.push("", (niv[1] && +niv[1] >= 3 ? "### " : "## ") + sansForme, "");
          } else if ((enfant(pPr, "numPr") || /list|liste|puce|bullet/.test(style)) && net) lignes.push("- " + texte.trim());
          else lignes.push(texte.trim() ? texte : "");
        } else if (n.localName === "tbl") {
          lignes.push("");
          for (const tr of enfants(n, "tr")) {
            const cases = enfants(tr, "tc").map((tc) => enfants(tc, "p").map(runs).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
            if (cases.length === 2 && cases[0].length <= 40) lignes.push(`**${sansMarkdown(cases[0]).replace(/\s*:$/, "")}** : ${cases[1]}`);
            else if (cases.length) lignes.push(cases.join(" — "));
            lignes.push("");
          }
        } else if (n.localName === "sdt" || n.localName === "sdtContent") traiter(n);
      }
    };
    traiter(corps);

    const fichiersImg = [];
    for (let i = 0; i < images.length; i++) {
      const chemin = "word/" + images[i].replace(/^\.?\//, "").replace(/^\/word\//, "");
      const ext = chemin.split(".").pop().toLowerCase();
      const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[ext];
      if (zip[chemin] && type) fichiersImg[i] = new File([await zip[chemin]()], "image-" + (i + 1) + "." + ext, { type });
    }
    return { texte: lignes.join("\n"), titre, images: fichiersImg };
  }

  async function chargerScript(url) {
    await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = url; s.onload = ok; s.onerror = () => ko(new Error("Impossible de charger le lecteur PDF (vérifie ta connexion).")); document.head.appendChild(s); });
  }

  async function pdfVersTexte(buffer) {
    const BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
    if (!window.pdfjsLib) await chargerScript(BASE + "pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];
    for (let n = 1; n <= Math.min(pdf.numPages, 80); n++) {
      const contenu = await (await pdf.getPage(n)).getTextContent();
      let lignes = [], ligne = "", dernierY = null, ecart = 0;
      for (const it of contenu.items) {
        if (!("str" in it)) continue;
        const y = it.transform[5], h = Math.abs(it.transform[3]) || 10;
        if (dernierY !== null && Math.abs(y - dernierY) > h * 0.5 && ligne) {
          lignes.push(ligne); ligne = "";
          if (Math.abs(y - dernierY) > h * 1.8) lignes.push("");
        }
        ligne += it.str;
        if (it.hasEOL) { lignes.push(ligne); ligne = ""; }
        dernierY = y; ecart = h;
      }
      if (ligne) lignes.push(ligne);
      // recoller les lignes d'un même paragraphe
      const paras = [];
      for (const l of lignes.map((x) => x.replace(/\s+/g, " ").trim())) {
        const der = paras[paras.length - 1];
        if (l && der && !/[.!?:»"]$/.test(der) && /^[a-zà-ÿ(«"-]/.test(l) && !/^[-•]/.test(l)) paras[paras.length - 1] = der.replace(/-$/, "") + (der.endsWith("-") ? "" : " ") + l;
        else paras.push(l);
      }
      pages.push(paras.join("\n").replace(/\n{3,}/g, "\n\n").trim());
    }
    const texte = pages.filter(Boolean).join("\n\n");
    if (!texte.trim()) throw new Error("Ce PDF ne contient pas de texte lisible (c'est peut-être une image scannée).");
    return { texte: devinerTitres(texte), titre: null, images: [] };
  }

  // Dans un texte brut, une ligne courte isolée suivie d'un paragraphe devient un intertitre
  function devinerTitres(texte) {
    const l = texte.split("\n");
    return l.map((x, i) => {
      const t = x.trim();
      const avant = i === 0 || !l[i - 1].trim(), apres = l[i + 1] && l[i + 1].trim();
      if (avant && apres && t.length >= 3 && t.length <= 40 && /^[A-ZÀ-ÝÉÈ0-9IVX]/.test(t) && !/[.,;:!?…»)]$/.test(t) && !/^#|^[-•*]/.test(t) && !t.includes(":") && t.split(" ").length <= 6)
        return "## " + t.replace(/^\d+[.)]\s*/, "");
      return x;
    }).join("\n");
  }

  async function lireFichierFiche(fichier) {
    const ext = (fichier.name.split(".").pop() || "").toLowerCase();
    if (fichier.size > 25 * 1024 * 1024) throw new Error("Fichier trop lourd (25 Mo maximum).");
    if (["txt", "md", "markdown", "text"].includes(ext) || fichier.type.startsWith("text/")) return { texte: devinerTitres((await fichier.text()).replace(/\r\n?/g, "\n")), titre: null, images: [] };
    if (ext === "docx") return docxVersTexte(await fichier.arrayBuffer());
    if (ext === "pdf") return pdfVersTexte(await fichier.arrayBuffer());
    if (ext === "doc") throw new Error("Ancien format Word (.doc) : ouvre-le et enregistre-le en .docx, puis réessaie.");
    if (ext === "odt" || ext === "pages" || ext === "rtf") throw new Error(`Format .${ext} non pris en charge : enregistre-le en .docx ou en PDF.`);
    throw new Error("Format non pris en charge. Utilise un fichier Word (.docx), PDF ou texte (.txt).");
  }

  // Repère les lignes "Clé : valeur" du début du texte pour remplir le titre et les infos
  const ALIAS_NOM = ["nom", "prenom", "nom complet", "prenom et nom", "nom et prenom", "name", "identite"];
  function extraireInfos(texte, champs) {
    const trouvees = [];
    let titre = null;
    const garder = [];
    const lignes = texte.split("\n");
    let enTete = true;
    lignes.forEach((l, idx) => {
      const estKV = /^\s*(?:[-•]\s*)?\**\s*[^:*\n]{2,35}?\s*\**\s*:\s*\S/.test(l);
      if (l.trim() && !estKV) enTete = false;
      const m = idx < 60 && l.match(/^\s*(?:[-•]\s*)?\**\s*([^:*\n]{2,35}?)\s*\**\s*:\s*\**\s*(.{1,150}?)\s*$/);
      if (m) {
        const cle = normal(sansMarkdown(m[1])), valeur = m[2].replace(/^\*+|\*+$/g, "").trim();
        if (ALIAS_NOM.includes(cle) && !titre) { titre = sansMarkdown(valeur); return; }
        const champ = champs.find((c) => { const n = normal(c); return n === cle || n.split(/\s*[\/,]\s*|\s+ou\s+/).some((t) => t && t === cle) || (cle.length > 3 && n.startsWith(cle)); });
        if (champ && valeur && !trouvees.some((t) => t.cle === champ)) { trouvees.push({ cle: champ, valeur }); return; }
        if (enTete && valeur && !/^https?:/.test(valeur)) { trouvees.push({ cle: sansMarkdown(m[1]).trim().replace(/^./, (c) => c.toUpperCase()), valeur }); return; }
      }
      garder.push(l);
    });
    return { titre, infos: trouvees, texte: garder.join("\n").replace(/^\s*\n+/, "").replace(/\n{3,}/g, "\n\n") };
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
          <a class="btn" href="#/ia">🤖 Assistant IA</a>
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
      ${estMembre() ? `<a class="carte-ia" href="#/creer-ia"><span class="ci-ic">✨</span><span><b>Créer un personnage avec l'IA</b><br><small>Choisis sa race, son rôle, son royaume… l'IA écrit une fiche cohérente avec le wiki.</small></span><span class="lc-fl">›</span></a>` : ""}
      <a class="carte-ia" href="#/ia"><span class="ci-ic">🤖</span><span><b>Assistant IA</b><br><small>Pose une question sur le lore, ou fais vérifier la cohérence du wiki.</small></span><span class="lc-fl">›</span></a>
      <form class="filtres" id="wiki-recherche" role="search"><input type="search" name="q" placeholder="🔍 Rechercher une fiche…"><button class="btn">Chercher</button></form>
      ${choixCategorie(null, fiches)}
      <h2 class="titre-section">Toutes les fiches</h2>
      ${fiches.length ? `<div class="grille">${fiches.map((f) => carte(f, auteurs)).join("")}</div>` : vide("Aucune fiche pour l'instant.")}`;
  };
  pages.wiki.apres = () => {
    brancherChoixCategorie();
    const f = $("#wiki-recherche");
    f.onsubmit = (e) => { e.preventDefault(); location.hash = "#/recherche?q=" + encodeURIComponent(f.q.value.trim()); };
  };

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
    const [f, auteurs, moments, des, desRaces] = await Promise.all([api.lireFiche(id), auteursMap(), api.listerMoments({ ficheId: id }), api.listerDes(), api.listerDesRaces()]);
    if (!f) return vide("Cette fiche n'existe pas (ou plus).", `<a class="btn" href="#/">Retour à l'accueil</a>`);
    pages.fiche.des = des;
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
        ${estPerso(f) ? (() => {
          const an = bonusFiche(f, des), manuel = TYPES_DES.some((t) => an[t].manuel);
          const { race: rf, base: bf } = baseRaciale(f);
          return `<section class="boite-de">
            <div class="bd-titre">🎲 Dés du personnage</div>
            <div class="bd-lignes">${TYPES_DES.map((t) => `
              <div class="bd-ligne"><span>${infoType(t).icone} ${infoType(t).nom}</span><b>1d${DE} ${signe(an[t].bonus)}</b>
              <small class="discret">${bf ? `racial ${esc(rf.nom)} ${signe(bf[t])} · expérience ${signe(an[t].bonus - bf[t])} (${nomPalier(an[t].bonus - bf[t])})` : estCasUnique(rf) ? "cas unique : valeurs individuelles" : "race absente du barème"}${!an[t].manuel && an[t].mots.length ? ` · d'après : ${an[t].mots.slice(0, 4).map(esc).join(", ")}` : ""}</small></div>`).join("")}</div>
            <div class="discret petit-texte">${manuel ? "Bonus réglés par le joueur, un admin ou l'IA." : `Estimation automatique : bonus racial + expérience estimée par mots-clés (+${CFG_DES.BONUS_PERSO_MAX || 5} max). Pour une vraie évaluation, demande la proposition de l'IA.`}</div>
            <div class="rangee"><a class="btn petit" href="#/des?perso=${encodeURIComponent(f.id)}">🎲 Lancer</a>${estMembre() ? `<button class="btn petit ${manuel ? "" : "btn-or"}" id="ia-des-bouton">🤖 Proposition de l'IA</button>` : ""}</div>
            <div id="ia-des-zone" class="bd-ia"></div>
          </section>`;
        })() : ""}

        <section class="boite-roues" id="boite-roues" hidden></section>

        <section class="boite-ia" id="boite-ia">
          <div class="bi-titre">🤖 Avis de l'archiviste <small class="discret">(IA)</small></div>
          <div id="ia-contenu"><span class="discret">Chargement…</span></div>
        </section>

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
    brancherAnalyseFiche(id);
    brancherRouesFiche(id);
    const bd = $("#ia-des-bouton");
    if (bd) bd.onclick = async () => {
      const z = $("#ia-des-zone"), f = indexParId.get(id);
      bd.disabled = true;
      const stop = attenteIA(z, ETAPES_DES);
      try {
        const r = await avecDelai(api.ia("des", { fiche_id: id, max: CFG_DES.BONUS_PERSO_MAX || 5, reperes: CFG_DES.RACES_PROPOSEES, paliers: CFG_DES.PALIERS, uniques: CFG_DES.CAS_UNIQUES, deja: bonusDeja(pages.fiche.des) }));
        stop();
        z.innerHTML = htmlPropositionDes(r.propositions[0], f && peutModifier(f));
        brancherUtiliserDes(z, r.propositions);
      } catch (e) { stop(); z.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message).replace(/\n/g, "<br>")}</p>`; }
      bd.disabled = false;
    };
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
      const pm = pages.editeur.prefillModif;
      if (pm && pm.id === id) { pages.editeur.prefillModif = null; f = { ...f, resume: pm.resume, infos: pm.infos, contenu: pm.contenu }; }
    }
    if (!peutPublier(f.categorie)) f.categorie = (CATS.find((c) => peutPublier(c.id)) || CATS[0]).id;
    if (!id) f.infos = catParId(f.categorie).champs.map((cle) => ({ cle, valeur: "" }));
    if (!id && pages.editeur.prefill) {
      const pf = pages.editeur.prefill; pages.editeur.prefill = null;
      Object.assign(f, { categorie: pf.categorie || f.categorie, titre: pf.titre || "", resume: pf.resume || "", contenu: pf.contenu || "" });
      for (const i of pf.infos || []) { const l = f.infos.find((x) => normal(x.cle) === normal(i.cle)); if (l) l.valeur = i.valeur; else f.infos.push(i); }
    }
    pages.editeur.fiche = f;
    pages.editeur.des = id ? deDe(await api.listerDes(), id) : null;
    pages.editeur.desRaces = await api.listerDesRaces();
    const cats = CATS.filter((c) => peutPublier(c.id) || c.id === f.categorie);
    return `
      <div class="entete-page"><div><div class="fil"><a href="#/">Accueil</a> › ${id ? "Modifier" : "Nouvelle fiche"}</div><h1>${id ? "Modifier la fiche" : "Nouvelle fiche"}</h1></div></div>
      <form class="editeur" id="editeur" autocomplete="off">
        ${!id ? `<a class="carte-ia petite" href="#/creer-ia"><span class="ci-ic">✨</span><span><b>Créer un personnage avec l'IA</b><br><small>Réponds à quelques questions, l'IA écrit la fiche.</small></span><span class="lc-fl">›</span></a>` : ""}
        <div class="import-zone" id="import-zone">
          <label class="btn import-bouton">📄 Remplir depuis un fichier<input type="file" id="fichier-import" accept=".docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></label>
          <span class="discret petit-texte" id="import-etat">Word (.docx), PDF ou texte : le texte complet est ajouté à la fiche.</span>
        </div>
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

        <fieldset id="champ-de" hidden><legend>🎲 Dé de la race</legend>
          <p class="discret">Chaque membre de cette race lance 1d${DE} + ces bonus.</p>
          <div class="proposition" id="proposition-race"></div>
          <div class="de-ligne">
            ${TYPES_DES.map((t) => `<label>${infoType(t).icone} ${infoType(t).nom}<input name="de_${t}" type="number" inputmode="numeric" value="0"></label>`).join("")}
          </div>
        </fieldset>
        <fieldset id="champ-analyse" ${estPerso(f) ? "" : "hidden"}><legend>🎲 Bonus de fiche (automatique)</legend>
          <p class="discret">Chaque lancer = 1d${DE} + bonus racial + bonus d'expérience (0 à +${CFG_DES.BONUS_PERSO_MAX || 5}). Ci-dessous, une estimation automatique ; pour une vraie évaluation, utilise « 🤖 Proposition de l'IA » sur la fiche publiée. En réglant à la main, mets le TOTAL (racial + expérience).</p>
          <div class="analyse" id="analyse-live"></div>
          <label class="case-manuel"><input type="checkbox" id="de-manuel"> ✏️ Régler le bonus à la main</label>
          <div class="de-ligne" id="de-manuel-zone" hidden>
            ${TYPES_DES.map((t) => `<label>${infoType(t).icone} ${infoType(t).nom}<input name="dm_${t}" type="number" inputmode="numeric" value="0"></label>`).join("")}
          </div>
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
    if (f.categorie === "peuples") { const dr = deRace(pages.editeur.desRaces, cleRace(f.titre)); if (!dr.nouveau) TYPES_DES.forEach((t) => (form["de_" + t].value = dr[CLE_RACE[t]] | 0)); }
    const majPropositionRace = () => {
      const z = $("#proposition-race"); if (!z) return;
      const p = form.categorie.value === "peuples" && cleRace(form.titre.value) ? proposerRace(cleRace(form.titre.value), { titre: form.titre.value, resume: form.resume.value, infos: lireInfos(), contenu: $("#contenu").value }) : null;
      z.innerHTML = p ? `💡 ${p.source === "fiche" ? "D'après la fiche" : "Proposé pour cette race"} : ${htmlProposition(p)} <button type="button" class="lien" id="utiliser-proposition">utiliser</button>` : "";
      const u = $("#utiliser-proposition");
      if (u) u.onclick = () => { TYPES_DES.forEach((t) => (form["de_" + t].value = p[t])); deTouche = true; };
    };
    let deTouche = false;
    const dejaManuel = !!(pages.editeur.des && !pages.editeur.des.nouveau && f.categorie === "personnages");
    if (dejaManuel) { $("#de-manuel").checked = true; $("#de-manuel-zone").hidden = false; TYPES_DES.forEach((t) => (form["dm_" + t].value = pages.editeur.des[CLE_RACE[t]] | 0)); }
    $("#de-manuel").onchange = () => {
      const on = $("#de-manuel").checked;
      $("#de-manuel-zone").hidden = !on;
      if (on && !dejaManuel) {
        const an = analyserFiche({ titre: form.titre.value, resume: form.resume.value, infos: lireInfos(), contenu: $("#contenu").value });
        TYPES_DES.forEach((t) => (form["dm_" + t].value = an[t].bonus));
      }
    };
    TYPES_DES.forEach((t) => (form["de_" + t].oninput = () => (deTouche = true)));
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
      $("#champ-de").hidden = true;
      $("#champ-analyse").hidden = c.id !== "personnages";
      if (typeof majAnalyse === "function") majAnalyse();
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

    /* Import d'un fichier */
    $("#fichier-import").onchange = async (e) => {
      const fichier = e.target.files[0];
      e.target.value = "";
      if (!fichier) return;
      const etat = $("#import-etat"), etatInitial = etat.textContent;
      const bouton = $(".import-bouton"); bouton.classList.add("occupe");
      try {
        etat.textContent = "Lecture de « " + fichier.name + " »…";
        const res = await lireFichierFiche(fichier);
        const champs = [...new Set([...catParId(form.categorie.value).champs, ...lireInfos().map((i) => i.cle)])];
        const ext = extraireInfos(res.texte, champs);
        let texte = ext.texte.trim();
        // images contenues dans le fichier Word
        const imgs = res.images || [];
        let envoyees = 0;
        for (let i = 0; i < imgs.length; i++) {
          let rempl = "";
          if (imgs[i] && envoyees < 30) {
            etat.textContent = `Envoi des images ${envoyees + 1} / ${Math.min(imgs.filter(Boolean).length, 30)}…`;
            try {
              const url = await api.envoyerImage(imgs[i]); envoyees++;
              if (!form.image_url.value) { form.image_url.value = url; apercuImg(); }   // 1re image = image principale (pas répétée dans le texte)
              else rempl = `![](${url})`;
            }
            catch (err) { console.warn(err); }
          }
          texte = texte.split(`%%IMG${i}%%`).join(rempl);
        }
        texte = texte.replace(/%%IMG\d+%%/g, "").replace(/\n{3,}/g, "\n\n").trim();
        if (!texte && !ext.infos.length) throw new Error("Le fichier semble vide.");

        if (ta.value.trim()) {
          if (confirm("Ta fiche contient déjà du texte.\n\nOK = remplacer le texte actuel\nAnnuler = ajouter le fichier à la fin")) ta.value = texte;
          else ta.value = ta.value.trimEnd() + "\n\n" + texte;
        } else ta.value = texte;

        const titre = res.titre || ext.titre;
        let remplis = 0;
        if (titre && !form.titre.value.trim()) { form.titre.value = titre.slice(0, 120); remplis++; }
        if (!form.titre.value.trim()) form.titre.value = fichier.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 120);
        const actuelles = lireInfos();
        for (const inf of ext.infos) {
          const l = $$(".info-ligne", zoneInfos).find((x) => normal($(".cle", x).value) === normal(inf.cle));
          if (l) { if (!$(".valeur", l).value.trim()) { $(".valeur", l).value = inf.valeur; remplis++; } }
          else { zoneInfos.insertAdjacentHTML("beforeend", ligneInfo(inf)); const n = zoneInfos.lastElementChild; $(".retirer", n).onclick = () => n.remove(); remplis++; }
        }
        modifie = true;
        $$(".onglet")[0].click();
        const morceaux = [`texte importé`];
        if (remplis) morceaux.push(`${remplis} case${remplis > 1 ? "s" : ""} remplie${remplis > 1 ? "s" : ""}`);
        if (envoyees) morceaux.push(`${envoyees} image${envoyees > 1 ? "s" : ""}`);
        form.oninput();
        etat.textContent = "✓ " + fichier.name + " : " + morceaux.join(", ") + ". Vérifie puis publie.";
        toast("Fichier importé !");
      } catch (err) {
        etat.textContent = etatInitial;
        toast(err.message, "erreur");
      } finally { bouton.classList.remove("occupe"); }
    };

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

    const majAnalyse = () => {
      const ch = $("#champ-analyse");
      if (!ch || ch.hidden || !document.body.contains(form)) return;
      const an = analyserFiche({ titre: form.titre.value, resume: form.resume.value, infos: lireInfos(), contenu: ta.value });
      $("#analyse-live").innerHTML = htmlAnalyse(an);
    };
    let attente;
    form.oninput = () => { modifie = true; clearTimeout(attente); attente = setTimeout(() => { majAnalyse(); majPropositionRace(); }, 400); };
    majAnalyse(); majPropositionRace();
    window.onbeforeunload = () => (modifie ? true : undefined);

    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#enregistrer");
      btn.disabled = true;
      const data = { categorie: form.categorie.value, titre: form.titre.value, resume: form.resume.value, image_url: form.image_url.value, infos: lireInfos(), contenu: ta.value, annee: form.annee.value, galerie };
      if (data.image_url && !urlSure(data.image_url)) { toast("L'adresse de l'image doit commencer par https://", "erreur"); btn.disabled = false; return; }
      try {
        const nouvelId = id ? (await api.modifierFiche(id, data), id) : await api.creerFiche(data);
        if (data.categorie === "personnages" && (dejaManuel || $("#de-manuel").checked)) {
          try {
            if ($("#de-manuel").checked) await api.majDes(nouvelId, ...TYPES_DES.map((t) => parseInt(form["dm_" + t].value, 10) || 0));
            else await api.supprimerDes(nouvelId);
          } catch (err) { toast("Fiche enregistrée, mais le bonus n'a pas pu l'être : " + err.message, "erreur"); }
        }
        if (data.categorie === "peuples" && deTouche) {
          try { await api.majDesRace(cleRace(data.titre), data.titre.trim().slice(0, 80), ...TYPES_DES.map((t) => parseInt(form["de_" + t].value, 10) || 0)); }
          catch (err) { toast("Fiche enregistrée, mais le dé n'a pas pu l'être : " + err.message, "erreur"); }
        }
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

  /* ---------- Dés ---------- */
  const CFG_DES = window.AETHERIA_DES || { DE: 15, BONUS_MAX: 15, POINTS_POUR_MAX: 18, TYPES: {} };
  const DE = CFG_DES.DE;
  const TYPES_DES = ["attaque", "defense", "soutien"];
  const infoType = (t) => (CFG_DES.TYPES[t] || { nom: t, icone: "🎲" });
  const CLE_RACE = { attaque: "bonus_attaque", defense: "bonus_defense", soutien: "bonus_soutien" };
  const signe = (n) => (n < 0 ? "− " + Math.abs(n) : "+ " + n);
  const estRace = (f) => f && f.categorie === "peuples";
  const estPerso = (f) => f && f.categorie === "personnages";

  // Les races viennent de la case « Race / Peuple » de chaque personnage (et des fiches de race)
  const cleRace = (v) => normal(sansMarkdown(v)).replace(/\s+/g, " ").trim().slice(0, 80);
  function raceDuPerso(perso) {
    if (!perso) return null;
    const info = (perso.infos || []).find((i) => /race|peuple|espece/.test(normal(i.cle)));
    if (!info || !info.valeur || !cleRace(info.valeur)) return null;
    const nom = sansMarkdown(info.valeur).replace(/\s+/g, " ").trim().slice(0, 80);
    return { cle: cleRace(nom), nom };
  }
  // Toutes les races connues : celles des personnages + les fiches de race
  function toutesLesRaces(fiches, desRaces) {
    const m = new Map();
    for (const f of fiches) {
      if (estPerso(f)) { const r = raceDuPerso(f); if (r && !m.has(r.cle)) m.set(r.cle, { ...r, persos: [] }); if (r) m.get(r.cle).persos.push(f); }
    }
    for (const f of fiches) if (estRace(f)) { const c = cleRace(f.titre); if (c && !m.has(c)) m.set(c, { cle: c, nom: f.titre.trim(), persos: [] }); if (c) m.get(c).fiche = f; }
    for (const [c, d] of Object.entries(desRaces || {})) if (!m.has(c)) m.set(c, { cle: c, nom: d.nom, persos: [] });
    return [...m.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }
  // Dé proposé pour une race : liste de races connues (mots-des.js), sinon analyse de sa fiche de race
  function proposerRace(cle, ficheRace) {
    const table = CFG_DES.RACES_PROPOSEES || {};
    let c = " " + cle.replace(/[-_'’()\/,.]/g, " ").replace(/\s+/g, " ").trim() + " ";
    for (const [alias, vrai] of Object.entries(CFG_DES.ALIAS_RACES || {})) if (c.includes(" " + alias + " ")) c += " " + vrai + " ";
    let best = null;
    for (const [nom, v] of Object.entries(table)) {
      const n = normal(nom).replace(/[-_'’]/g, " ").trim();
      const trouve = c.includes(" " + n + " ") || c.includes(" " + n + "s ") || c.includes(" " + n + "x ");
      if (trouve && (!best || n.length > best.n.length)) best = { n, v, nom };
    }
    const a = (mots) => (mots || []).some((m) => c.includes(" " + m + " "));
    if (best && best.n === "demon" && a(CFG_DES.PECHES) && table["demon lie a un peche"]) best = { n: "demon lie a un peche", v: table["demon lie a un peche"], nom: "demon lie a un peche" };
    if (best && best.n === "ange" && a(CFG_DES.VERTUS) && table["ange lie a une vertu"]) best = { n: "ange lie a une vertu", v: table["ange lie a une vertu"], nom: "ange lie a une vertu" };
    if (best) return { attaque: best.v[0], defense: best.v[1], soutien: best.v[2], source: "liste", classe: best.nom };
    if ((CFG_DES.CAS_UNIQUES || []).some((u) => c.includes(" " + normal(u) + " "))) return null;
    if (ficheRace && (ficheRace.contenu || ficheRace.resume)) {
      const an = analyserFiche(ficheRace);
      if (TYPES_DES.some((t) => an[t].bonus)) return { attaque: an.attaque.bonus, defense: an.defense.bonus, soutien: an.soutien.bonus, source: "fiche" };
    }
    return null;
  }
  const baseRaciale = (f) => { const r = raceDuPerso(f); const b = r ? proposerRace(r.cle, null) : null; return { race: r, base: b }; };
  const estCasUnique = (r) => !!r && (CFG_DES.CAS_UNIQUES || []).some((u) => (" " + r.cle.replace(/[-_'’]/g, " ") + " ").includes(" " + normal(u) + " "));
  const nomPalier = (n) => { let nom = (CFG_DES.PALIERS || [])[0] ? CFG_DES.PALIERS[0][0] : ""; for (const [p, v] of CFG_DES.PALIERS || []) if (n >= v) nom = p; return n < 0 ? "en dessous du bonus racial" : n > (CFG_DES.BONUS_PERSO_MAX || 5) ? "au-delà du barème" : nom; };
  const htmlProposition = (p) => `${TYPES_DES.map((t) => `${infoType(t).icone} ${signe(p[t])}`).join(" · ")}`;
  const deRace = (desRaces, cle) => (desRaces && desRaces[cle]) || { bonus_attaque: 0, bonus_defense: 0, bonus_soutien: 0, nouveau: true };
  const deDe = (des, id) => des[id] || { bonus_attaque: 0, bonus_defense: 0, bonus_soutien: 0, nouveau: true };

  /* Analyse d'une fiche de personnage : cherche les mots-clés de mots-des.js.
     Un mot trouvé dans le titre, le résumé ou les cases d'infos vaut 3 points,
     dans le texte il vaut 1 point par apparition (3 max). */
  function analyserFiche(f) {
    // on garde le mot d'origine (avec accents) pour l'affichage
    const mots = (t) => sansMarkdown(t).toLowerCase().split(/[^a-z0-9à-öø-ÿœæ]+/i).filter(Boolean).map((o) => ({ o, n: normal(o) }));
    const importants = mots([f.titre, f.resume, ...(f.infos || []).filter((i) => !/race|peuple|joueur/.test(normal(i.cle))).map((i) => i.cle + " " + i.valeur)].join(" "));
    const texte = mots(f.contenu || "");
    const res = {};
    for (const t of TYPES_DES) {
      let points = 0;
      const trouves = [];
      for (const brut of infoType(t).mots || []) {
        const exact = brut.endsWith(" "), m = brut.trim();
        const ok = (w) => (exact ? w.n === m : w.n.startsWith(m));
        const imp = importants.find(ok);
        const occ = texte.filter(ok);
        const p = (imp ? 3 : 0) + Math.min(occ.length, 3);
        if (p) { points += p; trouves.push((imp || occ[0]).o); }
      }
      const perso = Math.min(CFG_DES.BONUS_PERSO_MAX || 5, Math.round((points * (CFG_DES.BONUS_PERSO_MAX || 5)) / CFG_DES.POINTS_POUR_MAX));
      res[t] = { bonus: perso, mots: [...new Set(trouves)] };
    }
    // niveau de base selon la race (repères de mots-des.js)
    if (estPerso(f)) {
      const r = raceDuPerso(f), base = r ? proposerRace(r.cle, null) : null;
      for (const t of TYPES_DES) {
        const b = base ? base[t] | 0 : 0;
        res[t].bonus = Math.max(0, Math.min(CFG_DES.BONUS_MAX, b + res[t].bonus));
        res[t].base = b; res[t].individuel = res[t].bonus - b;
      }
    }
    return res;
  }
  // Bonus de fiche final : réglé à la main (ligne dans "des") sinon calcul automatique
  function bonusFiche(f, des) {
    const an = analyserFiche(f), m = des && des[f.id];
    if (!m) return an;
    const res = {};
    for (const t of TYPES_DES) res[t] = { bonus: m[CLE_RACE[t]] | 0, mots: an[t].mots, manuel: true };
    return res;
  }
  const htmlAnalyse = (a) => TYPES_DES.map((t) => `<span class="analyse-type">${infoType(t).icone} ${infoType(t).nom} <b>${signe(a[t].bonus)}</b>${a[t].mots.length ? ` <small class="discret">(${a[t].mots.slice(0, 5).map(esc).join(", ")}${a[t].mots.length > 5 ? "…" : ""})</small>` : ""}</span>`).join("");

  function formuleCote(c) {
    const p = [`1d${DE} (<b>${c.de}</b>)`];
    if (c.bonus_race) p.push(`${signe(c.bonus_race)} ${esc(c.race || "race")}`);
    if (c.bonus_perso) p.push(`${signe(c.bonus_perso)} perso`);
    if (c.bonus_extra) p.push(`${signe(c.bonus_extra)} bonus`);
    return p.join(" ");
  }
  /* ---------- Envoi sur Discord (salon des dés) ---------- */
  const lieuxMonde = () => [...indexParId.values()].filter((f) => f.categorie === "monde").map((f) => f.titre).sort((a, b) => a.localeCompare(b, "fr"));
  function htmlEnvoiDiscord(id, salonDefaut = "des") {
    if (!estMembre()) return "";
    return `<div class="envoi-discord" id="${id}">
      <select class="ed-salon" aria-label="Salon Discord"><option value="des" ${salonDefaut === "des" ? "selected" : ""}>🎲 Salon des dés</option><option value="missions" ${salonDefaut === "missions" ? "selected" : ""}>📜 Salon des missions</option></select>
      <input class="ed-lieu" list="${id}-lieux" maxlength="80" placeholder="📍 Lieu de la scène (facultatif)" value="${esc(lireLS("aetheria_lieu", ""))}">
      <datalist id="${id}-lieux">${lieuxMonde().map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
      <button type="button" class="btn petit btn-discord">📤 Envoyer sur Discord</button></div>`;
  }
  function brancherEnvoiDiscord(el, donnees) {
    const b = el && $(".btn-discord", el);
    if (!b) return;
    b.onclick = async () => {
      const lieu = ($(".ed-lieu", el).value || "").trim();
      ecrireLS("aetheria_lieu", lieu);
      b.disabled = true; b.textContent = "Envoi…";
      try { await api.ia("discord", { ...donnees(), lieu, salon: $(".ed-salon", el).value }); b.textContent = "✔ Envoyé sur Discord"; toast("Envoyé sur Discord !"); }
      catch (e) { b.disabled = false; b.textContent = "📤 Envoyer sur Discord"; toast(e.message, "erreur"); }
    };
  }

  function htmlLancer(l, auteurs) {
    const d = l.donnees, a = auteurs.get(l.auteur_id);
    const qui = (c) => esc(c.nom || c.race || "Anonyme");
    const pied = `<div class="lancer-pied">${a ? esc(a.pseudo) + " · " : ""}${new Date(l.cree_le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${estAdmin() ? ` · <button class="lien" data-suppr-lancer="${esc(l.id)}">supprimer</button>` : ""}</div>`;
    if (l.mode === "combat") {
      const g = d.gagnant;
      return `<li class="lancer lancer-combat">
        <div class="lancer-ligne"><span class="l-qui">⚔️ ${qui(d.a)}</span><span class="l-total ${g === "attaquant" ? "gagne" : ""}">${d.a.total}</span></div>
        <div class="l-formule">${formuleCote(d.a)}</div>
        <div class="lancer-ligne"><span class="l-qui">🛡️ ${qui(d.d)}</span><span class="l-total ${g === "defenseur" ? "gagne" : ""}">${d.d.total}</span></div>
        <div class="l-formule">${formuleCote(d.d)}</div>
        <div class="l-verdict">${g === "attaquant" ? `💥 <b>${qui(d.a)}</b> touche : <b>${d.degats}</b> dégât${d.degats > 1 ? "s" : ""}` : g === "defenseur" ? `🛡️ <b>${qui(d.d)}</b> pare l'attaque` : "⚖️ Égalité"}</div>
        ${pied}</li>`;
    }
    const ti = infoType(d.a.sens);
    return `<li class="lancer">
      <div class="lancer-ligne"><span class="l-qui">${ti.icone} ${qui(d.a)} <small class="discret">${esc(ti.nom.toLowerCase())}</small></span><span class="l-total">${d.a.total}</span></div>
      <div class="l-formule">${formuleCote(d.a)}</div>${pied}</li>`;
  }

  pages.des = async () => {
    const [fiches, auteurs, des, desRaces, lancers] = await Promise.all([majIndexTitres(), auteursMap(), api.listerDes(), api.listerDesRaces(), api.listerLancers(30)]);
    const persos = fiches.filter(estPerso);
    const races = toutesLesRaces(fiches, desRaces);
    const fichesRaces = new Map((await Promise.all(races.filter((r) => r.fiche).map((r) => api.lireFiche(r.fiche.id).catch(() => null)))).filter(Boolean).map((f) => [f.id, f]));
    pages.des.etat = { des, desRaces, fichesRaces, completes: new Map(), races: new Map(races.map((r) => [r.cle, r])) };
    const aRegler = races.filter((r) => deRace(desRaces, r.cle).nouveau && proposerRace(r.cle, r.fiche && fichesRaces.get(r.fiche.id)));
    const optPersos = `<option value="">— Aucun personnage —</option>` + persos.map((f) => `<option value="${esc(f.id)}">${esc(f.titre)}</option>`).join("");
    const optRaces = `<option value="">— Aucune race —</option>` + races.map((r) => `<option value="${esc(r.cle)}">${esc(r.nom)}</option>`).join("");
    const cote = (id, titre, ic) => `
      <div class="cote" id="${id}">
        <div class="cote-titre">${ic} ${titre}</div>
        <label>Personnage<select class="c-perso">${optPersos}</select></label>
        <div class="c-formule"></div>
      </div>`;
    return `
      <div class="entete-page"><div><h1><span class="ic-titre">🎲</span>Dés</h1>
        <p class="discret">Chaque lancer : <b>1d${DE}</b> + <b>bonus racial</b> + <b>bonus d'expérience</b> (de Débutant +0 à Maître +${CFG_DES.BONUS_PERSO_MAX || 5}), pour l'attaque, la défense et le soutien séparément.</p></div></div>

      ${estMembre() ? `
      <section class="panneau">
        <div class="modes"><button class="mode actif" data-mode="combat">⚔️ Combat</button><button class="mode" data-mode="simple">🎲 Lancer simple</button></div>
        <div id="zone-combat" class="cotes">${cote("cote-a", "Attaquant", "⚔️")}<div class="contre">VS</div>${cote("cote-d", "Défenseur", "🛡️")}</div>
        <div id="zone-simple" hidden>
          <div class="modes">${TYPES_DES.map((t, i) => `<button class="sens ${i ? "" : "actif"}" data-sens="${t}">${infoType(t).icone} ${infoType(t).nom}</button>`).join("")}</div>
          <div class="cotes">${cote("cote-s", "Lanceur", "🎲")}</div>
        </div>
        <button class="btn btn-or large" id="bouton-lancer">🎲 Lancer les dés</button>
        <div id="resultat-des"></div>
      </section>` : `<p class="note">${moi() ? "Ton compte doit être activé pour lancer les dés." : `<a href="#/connexion">Connecte-toi</a> pour lancer les dés.`}</p>`}

      <h2 class="titre-section">Derniers lancers <button class="lien petit-texte" id="rafraichir-lancers">↻ actualiser</button></h2>
      <ol class="lancers" id="liste-lancers">${lancers.map((l) => htmlLancer(l, auteurs)).join("") || `<p class="discret">Aucun lancer pour l'instant.</p>`}</ol>

      ${estMembre() && persos.length ? `
      <h2 class="titre-section">🤖 Bonus des personnages par l'IA</h2>
      <p class="discret">L'IA lit la fiche de chaque personnage, reconnaît sa race exacte et propose son bonus d'expérience (Débutant à Maître) en attaque, défense et soutien, en le comparant aux autres. Rien n'est appliqué sans votre accord.</p>
      <button class="btn" id="ia-des-tous-bouton">🤖 Faire évaluer les ${persos.length} personnage${persos.length > 1 ? "s" : ""}</button>
      <div id="ia-des-tous"></div>` : ""}`;
  };

  pages.des.apres = (_, params) => {
    const etat = pages.des.etat;
    const brancherSuppr = () => $$("[data-suppr-lancer]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Supprimer ce lancer de l'historique ?")) return;
      try { await api.supprimerLancer(b.dataset.supprLancer); rafraichir(); } catch (e) { toast(e.message, "erreur"); }
    }));
    const rafraichir = async () => {
      const [l, auteurs] = await Promise.all([api.listerLancers(30), auteursMap()]);
      const zone = $("#liste-lancers");
      if (zone) { zone.innerHTML = l.map((x) => htmlLancer(x, auteurs)).join("") || `<p class="discret">Aucun lancer pour l'instant.</p>`; brancherSuppr(); }
    };
    brancherSuppr();
    $("#rafraichir-lancers").onclick = rafraichir;
    clearInterval(pages.des.minuteur);
    pages.des.minuteur = setInterval(() => { if (!location.hash.startsWith("#/des")) clearInterval(pages.des.minuteur); else rafraichir(); }, 20000);

    let mode = "combat", sens = "attaque";
    const sensDe = (el) => (el.id === "cote-d" ? "defense" : el.id === "cote-s" ? sens : "attaque");
    const lireCote = (el) => {
      const s = sensDe(el);
      const perso = indexParId.get($(".c-perso", el).value), race = null;
      const complet = perso && etat.completes.get(perso.id);
      const an = complet ? bonusFiche(complet, etat.des) : null;
      return {
        nom: perso ? perso.titre : race ? race.nom : "",
        fiche_id: perso ? perso.id : null,
        race: race ? race.nom : "",
        sens: s,
        bonus_race: race ? deRace(etat.desRaces, race.cle)[CLE_RACE[s]] | 0 : 0,
        bonus_perso: an ? an[s].bonus : 0,
        bonus_extra: 0,
        _mots: an ? an[s].mots : [],
        _manuel: an ? !!an[s].manuel : false,
      };
    };
    const formule = (c) => {
      const p = [`1d${DE}`];
      if (c.bonus_race) p.push(`${signe(c.bonus_race)} <span class="discret">(${esc(c.race)})</span>`);
      if (c.bonus_perso) p.push(`${signe(c.bonus_perso)} <span class="discret">(perso)</span>`);
      const min = 1 + c.bonus_race + c.bonus_perso;
      return `<b>${p.join(" ")}</b><br><span class="discret petit-texte">résultat entre ${min} et ${min + DE - 1}</span>` +
        (c.fiche_id ? `<div class="c-mots">${c._manuel ? "Bonus réglé à la main." : c._mots.length ? `Fiche analysée : ${c._mots.slice(0, 6).map(esc).join(", ")}` : "Aucun mot-clé trouvé dans la fiche pour ce type de lancer."}</div>` : "");
    };
    const majFormules = () => $$(".cote").forEach((el) => ($(".c-formule", el).innerHTML = formule(lireCote(el))));

    $$("[data-sauver-race]").forEach((b) => (b.onclick = async () => {
      const cle = b.dataset.sauverRace, r = etat.races.get(cle);
      const v = (t) => parseInt($(`.r-${t}[data-race="${CSS.escape(cle)}"]`).value, 10) || 0;
      try {
        await api.majDesRace(cle, r.nom, v("attaque"), v("defense"), v("soutien"));
        etat.desRaces[cle] = { cle, nom: r.nom, bonus_attaque: v("attaque"), bonus_defense: v("defense"), bonus_soutien: v("soutien") };
        const badge = b.closest("tr").querySelector(".badge-nouveau"); if (badge) badge.remove();
        toast("Dé de « " + r.nom + " » enregistré.");
        if ($("#bouton-lancer")) majFormules();
      } catch (e) { toast(e.message, "erreur"); }
    }));

    const propositionDe = (cle) => { const r = etat.races.get(cle); return proposerRace(cle, r && r.fiche && etat.fichesRaces.get(r.fiche.id)); };
    $$("[data-proposer]").forEach((b) => (b.onclick = () => {
      const cle = b.dataset.proposer, p = propositionDe(cle);
      TYPES_DES.forEach((t) => ($(`.r-${t}[data-race="${CSS.escape(cle)}"]`).value = p[t]));
      toast("Proposition placée : appuie sur 💾 pour l'enregistrer.");
    }));
    const ap = $("#appliquer-propositions");
    if (ap) ap.onclick = async () => {
      const cles = [...etat.races.keys()].filter((c) => deRace(etat.desRaces, c).nouveau && propositionDe(c));
      if (!confirm(`Enregistrer les dés proposés pour ${cles.length} race(s) ? Tu pourras toujours les modifier.`)) return;
      ap.disabled = true;
      try {
        for (const c of cles) { const p = propositionDe(c); await api.majDesRace(c, etat.races.get(c).nom, p.attaque, p.defense, p.soutien); }
        toast("Dés enregistrés !"); router();
      } catch (e) { toast(e.message, "erreur"); ap.disabled = false; }
    };

    const bt = $("#ia-des-tous-bouton");
    if (bt) bt.onclick = async () => {
      const persos = [...indexParId.values()].filter(estPerso);
      const lots = [];
      for (let i = 0; i < persos.length; i += 40) lots.push(persos.slice(i, i + 40));
      if (lots.length > 1 && !confirm(`${persos.length} personnages : l'IA va les évaluer en ${lots.length} fois (${lots.length} utilisations de ta limite du jour). Continuer ?`)) return;
      const zone = $("#ia-des-tous");
      bt.disabled = true;
      const toutes = [];
      try {
        for (const [i, lot] of lots.entries()) {
          const stop = attenteIA(zone, lots.length > 1 ? [`Lot ${i + 1} sur ${lots.length} : l'IA lit les fiches…`, `Lot ${i + 1} sur ${lots.length} : évaluation en cours…`] : ["L'IA lit toutes les fiches…", "Elle évalue chaque personnage…", "Elle rédige ses explications…"]);
          try { const r = await avecDelai(api.ia("des", { fiche_ids: lot.map((f) => f.id), max: CFG_DES.BONUS_PERSO_MAX || 5, reperes: CFG_DES.RACES_PROPOSEES, paliers: CFG_DES.PALIERS, uniques: CFG_DES.CAS_UNIQUES, deja: [...bonusDeja(etat.des).filter((x) => !toutes.some((p) => p.titre === x.titre)), ...toutes.map((p) => ({ titre: p.titre, attaque: p.attaque, defense: p.defense, soutien: p.soutien }))] })); toutes.push(...r.propositions); }
          finally { stop(); }
        }
      } catch (e) { zone.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message).replace(/\n/g, "<br>")}</p>`; if (!toutes.length) { bt.disabled = false; return; } }
      const peut = (p) => { const f = indexParId.get(p.fiche_id); return f && peutModifier(f); };
      zone.insertAdjacentHTML("beforeend", `
        <div class="table-wrap"><table class="table table-prop">
          <thead><tr><th></th><th>Personnage</th>${TYPES_DES.map((t) => `<th>${infoType(t).icone}</th>`).join("")}</tr></thead>
          <tbody>${toutes.map((p) => `<tr>
            <td>${peut(p) ? `<input type="checkbox" class="coche-prop" data-id="${esc(p.fiche_id)}" checked>` : ""}</td>
            <td><a href="#/f/${encodeURIComponent(p.fiche_id)}">${esc(p.titre)}</a>${p.race ? `<br><small class="discret">${esc(p.race)}</small>` : ""}
              <details><summary class="discret">pourquoi ?</summary>${TYPES_DES.map((t) => p.raisons[t] ? `<div class="petit-texte">${infoType(t).icone} ${esc(p.raisons[t])}</div>` : "").join("")}</details></td>
            ${TYPES_DES.map((t) => `<td><b>${signe(p[t])}</b><br><small class="discret">${(p.base || {})[t] | 0}+${(p.individuel || {})[t] | 0}</small></td>`).join("")}</tr>`).join("")}</tbody>
        </table></div>
        ${toutes.some(peut) ? `<button class="btn btn-or" id="appliquer-prop">✔ Appliquer les bonus cochés</button>` : ""}
        ${toutes.some((p) => !peut(p)) ? `<p class="discret petit-texte">Sans case à cocher : seul l'auteur de la fiche ou un admin peut appliquer ses bonus.</p>` : ""}`);
      const ap2 = $("#appliquer-prop");
      if (ap2) ap2.onclick = async () => {
        const ids = $$(".coche-prop:checked").map((c) => c.dataset.id);
        if (!ids.length) return toast("Coche au moins un personnage.", "erreur");
        ap2.disabled = true;
        try { for (const id of ids) { const p = toutes.find((x) => x.fiche_id === id); await api.majDes(id, p.attaque, p.defense, p.soutien); } toast(`Bonus appliqués à ${ids.length} personnage${ids.length > 1 ? "s" : ""}.`); router(); }
        catch (e) { toast(e.message, "erreur"); ap2.disabled = false; }
      };
      bt.disabled = false;
    };

    if (!$("#bouton-lancer")) return;
    const choisirPerso = async (el, id) => {
      const r = raceDuPerso(indexParId.get(id));

      if (id && !etat.completes.has(id)) {
        $(".c-formule", el).innerHTML = `<span class="discret">Analyse de la fiche…</span>`;
        try { etat.completes.set(id, await api.lireFiche(id)); } catch (e) {}
      }
      majFormules();
    };
    $$(".cote").forEach((el) => {
      $(".c-perso", el).onchange = () => choisirPerso(el, $(".c-perso", el).value);

    });
    $$(".mode").forEach((b) => (b.onclick = () => {
      mode = b.dataset.mode;
      $$(".mode").forEach((x) => x.classList.toggle("actif", x === b));
      $("#zone-combat").hidden = mode !== "combat"; $("#zone-simple").hidden = mode !== "simple";
      $("#resultat-des").innerHTML = "";
    }));
    $$(".sens").forEach((b) => (b.onclick = () => { sens = b.dataset.sens; $$(".sens").forEach((x) => x.classList.toggle("actif", x === b)); majFormules(); }));
    const pre = params.get("perso");
    majFormules();
    if (pre && indexParId.get(pre)) {
      const f = indexParId.get(pre);
      if (estPerso(f)) for (const el of [$("#cote-a"), $("#cote-s")]) { $(".c-perso", el).value = f.id; choisirPerso(el, f.id); }

    }

    $("#bouton-lancer").onclick = async () => {
      const b = $("#bouton-lancer"); b.disabled = true;
      const zone = $("#resultat-des");
      zone.innerHTML = `<div class="de-roule">🎲</div>`;
      try {
        const net = (c) => { const { _mots, _manuel, ...x } = c; return x; };
        const a = net(lireCote(mode === "combat" ? $("#cote-a") : $("#cote-s")));
        const d = mode === "combat" ? net(lireCote($("#cote-d"))) : null;
        const [l] = await Promise.all([api.lancerDes(mode, a, d), new Promise((ok) => setTimeout(ok, 900))]);
        zone.innerHTML = `<ol class="lancers resultat-frais">${htmlLancer(l, await auteursMap())}</ol>${htmlEnvoiDiscord("ed-des")}`;
        brancherEnvoiDiscord($("#ed-des"), () => ({ type: "lancer", lancer_id: l.id }));
        rafraichir();
      } catch (e) { zone.innerHTML = ""; toast(e.message, "erreur"); }
      b.disabled = false;
    };
  };

  /* ---------- Assistant IA ---------- */
  const NOTE_IA = "L'IA propose, elle ne modifie rien. Elle peut se tromper : vérifie toujours.";
  const htmlAnalyseIA = (a, auteurs) => `
    <div class="ia-meta">${dateFr(a.cree_le)}${auteurs && auteurs.get(a.auteur_id) ? " · demandé par " + esc(auteurs.get(a.auteur_id).pseudo) : ""}${a.modele ? " · répondu par " + esc(/openai/.test(a.modele) ? "ChatGPT" : /xai|grok/.test(a.modele) ? "Grok" : /claude/.test(a.modele) ? "Claude" : "Gemini") : ""}</div>
    <div class="contenu ia-texte">${markdown(a.contenu)}</div>`;

  // Écran d'attente : animation, compteur de secondes, étapes
  function attenteIA(el, etapes) {
    const debut = Date.now();
    el.innerHTML = `<div class="attente-ia"><div class="orbe"><span>🤖</span></div><div><div class="ai-etape"></div><div class="ai-temps"></div></div></div>`;
    const maj = () => {
      const s = Math.floor((Date.now() - debut) / 1000);
      $(".ai-etape", el) && ($(".ai-etape", el).textContent = etapes[Math.min(Math.floor(s / 5), etapes.length - 1)]);
      $(".ai-temps", el) && ($(".ai-temps", el).textContent = `${s} s${s > 40 ? " · c'est long aujourd'hui, l'IA est peut-être très demandée…" : ""}`);
    };
    maj();
    const t = setInterval(maj, 1000);
    return () => clearInterval(t);
  }
  const ETAPES_FICHE = ["Lecture de la fiche…", "Lecture du reste du wiki…", "Recherche d'incohérences…", "Préparation des suggestions…", "Rédaction de l'avis…"];
  const ETAPES_GLOBAL = ["Lecture de toutes les fiches…", "Comparaison des fiches entre elles…", "Recherche des contradictions…", "Repérage des fiches manquantes…", "Rédaction du rapport…"];
  const ETAPES_CHAT = ["L'archiviste lit ta question…", "Il cherche dans les fiches…", "Il rédige sa réponse…"];
  // Abandonne côté site si aucune réponse au bout de 2 min 30
  const avecDelai = (promesse) => Promise.race([promesse, new Promise((_, ko) => setTimeout(() => ko(new Error("Pas de réponse de l'IA au bout de 2 minutes. Réessaie plus tard.")), 150000))]);

  /* Correction d'une fiche par l'IA : proposition → vérification → application */
  async function corrigerFiche(id, z, bouton) {
    bouton.disabled = true;
    const stop = attenteIA(z, ["L'IA relit la fiche…", "Elle la compare au reste du wiki…", "Elle corrige les incohérences…", "Elle corrige l'orthographe…", "Elle prépare la liste des changements…"]);
    try {
      const [r, f] = await Promise.all([avecDelai(api.ia("corriger", { fiche_id: id })), api.lireFiche(id)]);
      stop();
      const c = r.correction;
      const fusionInfos = () => {
        const res = (f.infos || []).map((i) => { const k = Object.keys(c.infos).find((x) => normal(x) === normal(i.cle)); return { cle: i.cle, valeur: k !== undefined ? c.infos[k] : i.valeur }; });
        for (const [cle, valeur] of Object.entries(c.infos)) if (valeur && !res.some((i) => normal(i.cle) === normal(cle))) res.push({ cle, valeur });
        return res;
      };
      const raccourci = (f.contenu || "").length > 400 && c.contenu.length < (f.contenu || "").length * 0.6;
      if (!c.changements.length && !c.a_verifier.length) { z.innerHTML = `<p class="note">✅ L'IA n'a rien trouvé à corriger dans cette fiche.</p>`; bouton.disabled = false; return; }
      z.innerHTML = `<div class="prop-des correction">
        <div class="pd-titre">✍️ Corrections proposées (${c.changements.length})</div>
        ${c.changements.length ? `<ul>${c.changements.map((x) => `<li>${inline(esc(x))}</li>`).join("")}</ul>` : `<p class="discret">Aucune correction automatique.</p>`}
        ${c.a_verifier.length ? `<div class="pd-titre">⚠️ À trancher par toi (non corrigé)</div><ul>${c.a_verifier.map((x) => `<li>${inline(esc(x))}</li>`).join("")}</ul>` : ""}
        ${raccourci ? `<p class="note erreur-note">⚠️ Le texte corrigé est nettement plus court que l'original : vérifie qu'aucun passage n'a disparu avant d'appliquer.</p>` : ""}
        <details><summary>Voir le texte corrigé</summary><div class="contenu ia-texte">${c.resume ? `<p><i>${esc(c.resume)}</i></p>` : ""}${markdown(c.contenu)}</div></details>
        ${c.changements.length ? `<div class="rangee">
          <button class="btn btn-or petit" id="appliquer-correction">✔ Appliquer les corrections</button>
          <button class="btn petit" id="editer-correction">✎ Ouvrir dans l'éditeur</button>
          <button class="lien" id="annuler-correction">Annuler</button></div>` : ""}
      </div>`;
      const ap = $("#appliquer-correction");
      if (ap) ap.onclick = async () => {
        if (!confirm("Remplacer le texte de la fiche par la version corrigée ?")) return;
        ap.disabled = true;
        try {
          await api.modifierFiche(id, { categorie: f.categorie, titre: f.titre, resume: c.resume, image_url: f.image_url, infos: fusionInfos(), contenu: c.contenu, annee: f.annee, galerie: f.galerie });
          toast("Fiche corrigée !"); router();
        } catch (e) { toast(e.message, "erreur"); ap.disabled = false; }
      };
      const ed = $("#editer-correction");
      if (ed) ed.onclick = () => { pages.editeur.prefillModif = { id, resume: c.resume, infos: fusionInfos(), contenu: c.contenu }; location.hash = "#/editer/" + encodeURIComponent(id); };
      const an = $("#annuler-correction");
      if (an) an.onclick = () => { z.innerHTML = ""; };
    } catch (e) { stop(); z.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message).replace(/\n/g, "<br>")}</p>`; }
    bouton.disabled = false;
  }

  /* ---------- Roues de pouvoirs sur la fiche ---------- */
  const ETAPES_ROUES = ["L'IA lit les pouvoirs du personnage…", "Elle cherche ce qui dépend du hasard…", "Elle prépare les cases et leurs effets…", "Elle vérifie que tout colle à la fiche…"];
  async function brancherRouesFiche(id) {
    const boite = $("#boite-roues");
    if (!boite) return;
    const f = indexParId.get(id);
    const proprio = f && peutModifier(f);
    let roues = await api.listerRouesPerso(id).catch(() => []);
    let propositions = null;
    const dessiner = () => {
      if (!roues.length && !proprio && !propositions) { boite.hidden = true; return; }
      boite.hidden = false;
      boite.innerHTML = `
        <div class="bd-titre">🎡 Roues du personnage</div>
        ${roues.length ? `<ul class="roues-liste">${roues.map((r) => `
          <li><div><b>${esc(r.nom)}</b> <small class="discret">${(r.elements || []).length} cases</small>${r.description ? `<div class="discret petit-texte">${esc(r.description)}</div>` : ""}</div>
            <div class="rangee"><a class="btn petit btn-or" href="#/roue?roue=${encodeURIComponent(r.id)}">🎡 Tourner</a>${proprio ? `<button class="btn petit btn-danger" data-suppr-roue="${esc(r.id)}">Supprimer</button>` : ""}</div></li>`).join("")}</ul>`
          : `<p class="discret">Pas de roue pour ce personnage. Si ses pouvoirs reposent sur le hasard (cartes, dés, runes, effets aléatoires…), l'IA peut en créer une.</p>`}
        ${proprio ? `<div class="rangee"><button class="btn petit ${roues.length ? "" : "btn-or"}" id="ia-roues">🤖 Proposer des roues</button></div>` : ""}
        <div id="ia-roues-zone"></div>`;
      $$("[data-suppr-roue]", boite).forEach((b) => (b.onclick = async () => {
        const r = roues.find((x) => x.id === b.dataset.supprRoue);
        if (!r || !confirm(`Supprimer la roue « ${r.nom} » ?`)) return;
        try { await api.supprimerRouePerso(r.id); roues = roues.filter((x) => x.id !== r.id); toast("Roue supprimée."); dessiner(); }
        catch (e) { toast(e.message, "erreur"); }
      }));
      const bi = $("#ia-roues");
      if (bi) bi.onclick = async () => {
        const z = $("#ia-roues-zone");
        bi.disabled = true;
        const stop = attenteIA(z, ETAPES_ROUES);
        try {
          const r = await avecDelai(api.ia("roues", { fiche_id: id }));
          stop();
          propositions = r;
          montrer();
        } catch (e) { stop(); z.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message).replace(/\n/g, "<br>")}</p>`; }
        bi.disabled = false;
      };
      if (propositions) montrer();
    };
    const montrer = () => {
      const z = $("#ia-roues-zone"), r = propositions;
      if (!z || !r) return;
      if (!r.roues || !r.roues.length) {
        z.innerHTML = `<div class="scenario"><p><b>Aucune roue n'est nécessaire</b> d'après l'IA.</p>${r.explication ? `<p class="discret">${esc(r.explication)}</p>` : ""}</div>`;
        return;
      }
      z.innerHTML = `<div class="scenario">
        ${r.explication ? `<p class="discret">${esc(r.explication)}</p>` : ""}
        ${r.roues.map((w, k) => `
          <div class="roue-propo">
            <h3>${esc(w.nom)} <small class="discret">${w.elements.length} cases</small></h3>
            ${w.description ? `<p class="discret">${esc(w.description)}</p>` : ""}
            <details><summary>Voir les cases</summary><ol class="liste-pouvoirs">${w.elements.map((e) => `<li><b>${esc(e.nom)}</b>${e.poids > 1 ? ` <small class="discret">×${e.poids}</small>` : ""}${e.effet ? ` — <span class="discret">${esc(e.effet)}</span>` : ""}</li>`).join("")}</ol></details>
            <div class="rangee"><button class="btn petit btn-or" data-garder-roue="${k}">💾 Enregistrer cette roue</button></div>
          </div>`).join("")}
        <p class="discret petit-texte">Rien n'est enregistré tant que tu n'appuies pas sur « Enregistrer ». ${NOTE_IA}</p></div>`;
      $$("[data-garder-roue]", z).forEach((b) => (b.onclick = async () => {
        const w = r.roues[+b.dataset.garderRoue];
        b.disabled = true;
        try {
          const cree = await api.creerRouePerso({ fiche_id: id, nom: w.nom, description: w.description, elements: w.elements });
          roues = [...roues, cree];
          r.roues = r.roues.filter((x) => x !== w);
          if (!r.roues.length) propositions = null;
          toast("Roue enregistrée ! Tu peux la tourner dans 🎡 Roue › ✨ Pouvoirs.");
          dessiner();
        } catch (e) { b.disabled = false; toast(e.message, "erreur"); }
      }));
    };
    dessiner();
  }

  async function brancherAnalyseFiche(id) {
    const zone = $("#ia-contenu");
    if (!zone) return;
    const [a, auteurs] = await Promise.all([api.derniereAnalyse(id), auteursMap()]);
    await majIndexTitres();
    const ficheIA = indexParId.get(id);
    const dessiner = (analyse, msg) => {
      zone.innerHTML = `
        ${analyse ? htmlAnalyseIA(analyse, auteurs) : `<p class="discret">${msg || "Pas encore d'analyse pour cette fiche."}</p>`}
        <div class="rangee">
          ${estMembre() ? `<button class="btn petit ${analyse ? "" : "btn-or"}" id="lancer-ia">🤖 ${analyse ? "Relancer l'analyse" : "Analyser cette fiche"}</button>` : ""}
          ${ficheIA && peutModifier(ficheIA) ? `<button class="btn petit" id="corriger-ia">✍️ Corriger la fiche</button>` : ""}
        </div>
        <div id="correction-ia"></div>
        <p class="discret petit-texte">${NOTE_IA}</p>`;
      const bc = $("#corriger-ia");
      if (bc) bc.onclick = () => corrigerFiche(id, $("#correction-ia"), bc);
      const b = $("#lancer-ia");
      if (b) b.onclick = async () => {
        const stop = attenteIA(zone, ETAPES_FICHE);
        try {
          const r = await avecDelai(api.ia("fiche", { fiche_id: id }));
          stop();
          dessiner(r.analyse || { contenu: r.texte, cree_le: new Date().toISOString(), auteur_id: moi().user.id });
          if (typeof r.restant === "number") toast(`Analyse terminée. Il te reste ${r.restant} utilisation${r.restant > 1 ? "s" : ""} aujourd'hui.`);
        } catch (e) { stop(); dessiner(analyse, null); zone.insertAdjacentHTML("afterbegin", `<p class="note erreur-note">⚠️ ${esc(e.message).replace(/\n/g, "<br>")}</p>`); }
      };
    };
    dessiner(a);
  }

  /* Propositions de bonus de dés par l'IA */
  const ETAPES_DES = ["L'IA lit la fiche…", "Elle évalue l'attaque…", "…puis la défense…", "…et le soutien…", "Elle rédige ses explications…"];
  function htmlPropositionDes(p, peut) {
    const b = p.base || {}, ind = p.individuel || {}, pal = p.palier || {};
    return `<div class="prop-des">
      <div class="pd-titre">🤖 Proposition de l'IA${p.titre ? " pour " + esc(p.titre) : ""}${p.race ? ` · ${esc(p.race)}` : ""}</div>
      ${TYPES_DES.map((t) => `<div class="pd-ligne"><span>${infoType(t).icone} ${infoType(t).nom}</span><b>1d${DE} ${signe(p[t] | 0)}</b>
        <small class="discret">racial ${signe(b[t] | 0)} + expérience ${signe(ind[t] | 0)}${pal[t] ? ` (${esc(pal[t])})` : ""}${p.raisons && p.raisons[t] ? ` — ${esc(p.raisons[t])}` : ""}</small></div>`).join("")}
      ${p.note ? `<p class="discret petit-texte">ℹ️ ${esc(p.note)}</p>` : ""}
      ${peut ? `<button class="btn btn-or petit" data-utiliser-des="${esc(p.fiche_id)}">✔ Utiliser ces bonus</button>` : `<p class="discret petit-texte">Seul l'auteur de la fiche ou un admin peut appliquer ces bonus.</p>`}
    </div>`;
  }
  // Bonus déjà réglés (à la main ou via l'IA) de tous les personnages, pour que l'IA compare
  const bonusDeja = (des) => [...indexParId.values()].filter((f) => estPerso(f) && des && des[f.id])
    .map((f) => ({ titre: f.titre, attaque: des[f.id].bonus_attaque | 0, defense: des[f.id].bonus_defense | 0, soutien: des[f.id].bonus_soutien | 0 }));
  function brancherUtiliserDes(racine, propositions) {
    $$("[data-utiliser-des]", racine).forEach((b) => (b.onclick = async () => {
      const p = propositions.find((x) => x.fiche_id === b.dataset.utiliserDes);
      b.disabled = true;
      try { await api.majDes(p.fiche_id, p.attaque, p.defense, p.soutien); toast("Bonus de « " + p.titre + " » enregistrés (réglés à la main)."); router(); }
      catch (e) { toast(e.message, "erreur"); b.disabled = false; }
    }));
  }

  let conversationIA = [];
  pages.ia = async () => {
    await majIndexTitres();
    const [globale, auteurs] = await Promise.all([api.derniereAnalyse(null), auteursMap()]);
    pages.ia.auteurs = auteurs;
    const idees = ["Résume-moi le lore d'Aetheria", "Quelles races existent et qui en fait partie ?", "Y a-t-il des contradictions dans la chronologie ?", "Aide-moi à créer un personnage cohérent avec le monde"];
    return `
      <div class="entete-page"><div><div class="fil"><a href="#/wiki">Wiki</a> › Assistant IA</div><h1><span class="ic-titre">🤖</span>Assistant IA</h1>
        <p class="discret">L'archiviste a lu tout le wiki. Pose-lui une question ou demande-lui de vérifier la cohérence. ${NOTE_IA}</p></div></div>

      <section class="panneau">
        <h2>💬 Demande à l'archiviste</h2>
        <div class="chat" id="chat">${conversationIA.map((m) => bulle(m)).join("") || `<div class="idees">${idees.map((q) => `<button class="idee" data-idee="${esc(q)}">${esc(q)}</button>`).join("")}</div>`}</div>
        ${estMembre() ? `<form class="chat-saisie" id="form-chat">
          <textarea name="q" rows="2" maxlength="2000" placeholder="Ex : Qui sont les ennemis de Raphaël ?" required></textarea>
          <button class="btn btn-or">Envoyer</button>
        </form>
        ${conversationIA.length ? `<button class="lien petit-texte" id="nouvelle-conv">Nouvelle conversation</button>` : ""}` : `<p class="note">Connecte-toi avec un compte membre pour utiliser l'assistant.</p>`}
      </section>

      <section class="panneau">
        <h2>🔎 Cohérence de tout le wiki</h2>
        <div id="ia-globale">${globale ? htmlAnalyseIA(globale, auteurs) : `<p class="discret">Aucune analyse globale pour l'instant.</p>`}</div>
        ${estMembre() ? `<button class="btn ${globale ? "" : "btn-or"}" id="lancer-globale">🔎 ${globale ? "Relancer l'analyse du wiki" : "Analyser tout le wiki"}</button>` : ""}
      </section>`;
  };
  const bulle = (m) => `<div class="bulle ${m.role === "user" ? "bulle-moi" : "bulle-ia"}">${m.role === "user" ? esc(m.content).replace(/\n/g, "<br>") : `<div class="contenu ia-texte">${markdown(m.content)}</div>`}</div>`;

  pages.ia.apres = () => {
    const chat = $("#chat");
    const defiler = () => chat.lastElementChild && chat.lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const envoyer = async (q) => {
      q = (q || "").trim();
      if (!q) return;
      const f = $("#form-chat"); if (f) { f.q.value = ""; $("button", f).disabled = true; }
      if (!conversationIA.length) chat.innerHTML = "";
      conversationIA.push({ role: "user", content: q });
      chat.insertAdjacentHTML("beforeend", bulle({ role: "user", content: q }) + `<div class="bulle bulle-ia" id="attente"></div>`);
      const stop = attenteIA($("#attente"), ETAPES_CHAT);
      defiler();
      try {
        const r = await avecDelai(api.ia("question", { question: q, historique: conversationIA.slice(0, -1).slice(-8) })).finally(stop);
        conversationIA.push({ role: "assistant", content: r.texte });
        $("#attente").outerHTML = bulle({ role: "assistant", content: r.texte });
      } catch (e) {
        conversationIA.pop();
        stop();
        $("#attente").outerHTML = `<div class="bulle bulle-ia erreur-ia">⚠️ ${esc(e.message)}</div>`;
      }
      if (f) $("button", f).disabled = false;
      defiler();
    };
    $$("[data-idee]").forEach((b) => (b.onclick = () => estMembre() ? envoyer(b.dataset.idee) : toast("Connecte-toi pour utiliser l'assistant.", "erreur")));
    const f = $("#form-chat");
    if (f) {
      f.onsubmit = (e) => { e.preventDefault(); envoyer(f.q.value); };
      f.q.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 760) { e.preventDefault(); envoyer(f.q.value); } };
    }
    const n = $("#nouvelle-conv");
    if (n) n.onclick = () => { conversationIA = []; router(); };
    const g = $("#lancer-globale");
    if (g) g.onclick = async () => {
      g.disabled = true;
      const zoneG = $("#ia-globale"), avant = zoneG.innerHTML;
      const stop = attenteIA(zoneG, ETAPES_GLOBAL);
      try {
        const r = await avecDelai(api.ia("global"));
        stop();
        zoneG.innerHTML = htmlAnalyseIA(r.analyse || { contenu: r.texte, cree_le: new Date().toISOString() }, pages.ia.auteurs);
        g.textContent = "🔎 Relancer l'analyse du wiki";
      } catch (e) { stop(); zoneG.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message)}</p>` + avant; g.textContent = "🔎 Réessayer"; }
      g.disabled = false;
    };
  };

  /* ---------- Création de personnage avec l'IA (assistant pas à pas) ---------- */
  const JOLIS_NOMS = {
    "humain": "Humain", "hybride": "Hybride", "hybride humain bete": "Hybride humain-bête", "sirene": "Sirène", "elfe aile": "Elfe ailé",
    "elfe noir": "Elfe noir", "oni": "Oni", "vampire": "Vampire", "demon": "Démon", "demon lie a un peche": "Démon lié à un péché",
    "ange": "Ange", "ange lie a une vertu": "Ange lié à une vertu", "archange": "Archange", "archange dechu": "Archange déchu", "dieu primordial": "Dieu primordial",
  };
  let creation = null;
  const nouvelleCreation = () => ({ etape: 0, race: "", role: "", lieu: "", rang: "", magie: "", faction: "", details: { nom: "", age: "", genre: "", idees: "" } });

  pages.creerIA = async () => {
    if (!estMembre()) return pasMembre();
    await majIndexTitres();
    if (!creation) creation = nouvelleCreation();
    return `
      <div class="entete-page"><div><div class="fil"><a href="#/wiki">Wiki</a> › Créer avec l'IA</div>
        <h1><span class="ic-titre">🤖</span>Créer un personnage avec l'IA</h1>
        <p class="discret">Réponds à quelques questions : l'IA écrit une fiche cohérente avec tout le wiki. Tu pourras la relire et la modifier avant de la publier.</p></div></div>
      <div class="assistant" id="assistant"></div>`;
  };

  pages.creerIA.apres = () => {
    const zone = $("#assistant");
    if (!zone) return;
    const toutes = [...indexParId.values()];
    const titres = (cat) => toutes.filter((f) => f.categorie === cat).map((f) => f.titre).sort((a, b) => a.localeCompare(b, "fr"));
    // races : celles des personnages, les fiches de race et le barème des dés
    const races = new Map();
    toutesLesRaces(toutes, {}).forEach((r) => races.set(r.cle, r.nom));
    Object.keys(CFG_DES.RACES_PROPOSEES || {}).forEach((k) => { if (![...races.keys()].some((c) => c.replace(/[-_'’]/g, " ") === k)) races.set(k, JOLIS_NOMS[k] || k); });
    const listeRaces = [...races.values()].sort((a, b) => a.localeCompare(b, "fr"));

    const ETAPES = [
      { cle: "race", titre: "Quelle race ?", aide: "Les races déjà présentes dans ton wiki et ton système de dés.", choix: listeRaces, libre: "Autre race…", obligatoire: true },
      { cle: "role", titre: "Quel rôle dans l'histoire ?", choix: ["Protagoniste", "Antagoniste", "Allié", "Mentor", "Rival", "Neutre / ambigu", "Personnage secondaire"], libre: "Autre rôle…", ia: "Surprends-moi" },
      { cle: "lieu", titre: "Où vit-il ? (royaume, ville, région)", aide: titres("monde").length ? "Les lieux de ta catégorie « Le Monde »." : "Ton wiki n'a pas encore de lieux : écris-en un ou laisse l'IA choisir.", choix: titres("monde"), libre: "Autre lieu…", ia: "L'IA choisit" },
      { cle: "rang", titre: "Son rang social ou son métier ?", choix: ["Roi / Reine", "Prince / Princesse", "Noble", "Chevalier", "Soldat", "Mage", "Prêtre / Prêtresse", "Marchand", "Artisan", "Aventurier de guilde", "Voleur / Assassin", "Érudit", "Paysan", "Hors-la-loi"], libre: "Autre métier…", ia: "L'IA choisit" },
      { cle: "magie", titre: "Utilise-t-il la magie ?", aide: titres("magie").length ? "Tu peux choisir une magie de ton wiki." : "", choix: ["Non, aucune magie", ...titres("magie").map((t) => "Oui : " + t)], libre: "Oui, une autre magie…", ia: "Selon sa race (l'IA décide)" },
      { cle: "faction", titre: "Fait-il partie d'une faction ?", choix: ["Aucune faction", ...titres("factions")], libre: "Autre faction…", ia: "L'IA choisit" },
      { cle: "details", titre: "Des détails à imposer ?", aide: "Tout est facultatif : laisse vide pour que l'IA invente." },
    ];

    const dessiner = () => {
      const c = creation, n = ETAPES.length;
      if (c.etape >= n) return recap();
      const e = ETAPES[c.etape], valeur = c[e.cle];
      const barre = `<div class="progression"><div style="width:${Math.round(((c.etape + 1) / (n + 1)) * 100)}%"></div></div><div class="discret petit-texte">Question ${c.etape + 1} sur ${n}</div>`;
      if (e.cle === "details") {
        const d = c.details;
        zone.innerHTML = `${barre}<h2>${e.titre}</h2><p class="discret">${e.aide}</p>
          <form id="form-details" class="panneau">
            <label>Nom ou prénom<input name="nom" maxlength="60" value="${esc(d.nom)}" placeholder="ex : Elarion"></label>
            <div class="ligne2"><label>Âge<input name="age" maxlength="40" value="${esc(d.age)}" placeholder="ex : 230 ans"></label>
            <label>Genre<input name="genre" maxlength="40" value="${esc(d.genre)}" placeholder="ex : femme"></label></div>
            <label>Personnalité, apparence, idées d'histoire…<textarea name="idees" rows="4" maxlength="1500" placeholder="ex : timide mais redoutable à l'arc, cherche à venger sa sœur…">${esc(d.idees)}</textarea></label>
          </form>
          <div class="rangee fin"><button class="btn" id="precedent">← Retour</button><button class="btn btn-or" id="suivant">Voir le récapitulatif →</button></div>`;
        const lire = () => { const f = $("#form-details"); c.details = { nom: f.nom.value.trim(), age: f.age.value.trim(), genre: f.genre.value.trim(), idees: f.idees.value.trim() }; };
        $("#precedent").onclick = () => { lire(); c.etape--; dessiner(); };
        $("#suivant").onclick = () => { lire(); c.etape++; dessiner(); };
        return;
      }
      const dansListe = e.choix.includes(valeur) || (e.ia && valeur === e.ia);
      zone.innerHTML = `${barre}<h2>${e.titre}</h2>${e.aide ? `<p class="discret">${e.aide}</p>` : ""}
        <div class="choix-assistant">
          ${e.ia ? `<button type="button" class="choix ${valeur === e.ia ? "actif" : ""}" data-v="${esc(e.ia)}">🎲 ${esc(e.ia)}</button>` : ""}
          ${e.choix.map((v) => `<button type="button" class="choix ${valeur === v ? "actif" : ""}" data-v="${esc(v)}">${esc(v)}</button>`).join("")}
        </div>
        <input id="valeur-libre" class="champ-libre" maxlength="80" placeholder="${esc(e.libre)}" value="${!dansListe && valeur ? esc(valeur) : ""}">
        <div class="rangee fin">${c.etape ? `<button class="btn" id="precedent">← Retour</button>` : ""}<button class="btn btn-or" id="suivant" ${valeur || !e.obligatoire ? "" : "disabled"}>${valeur || e.obligatoire ? "Suivant →" : "Passer →"}</button></div>`;
      const majBouton = () => { const b = $("#suivant"); b.disabled = e.obligatoire && !c[e.cle]; b.textContent = c[e.cle] || e.obligatoire ? "Suivant →" : "Passer →"; };
      $$("[data-v]", zone).forEach((b) => (b.onclick = () => {
        c[e.cle] = c[e.cle] === b.dataset.v ? "" : b.dataset.v;
        $("#valeur-libre").value = "";
        $$("[data-v]", zone).forEach((x) => x.classList.toggle("actif", x.dataset.v === c[e.cle]));
        majBouton();
        if (c[e.cle]) setTimeout(() => { c.etape++; dessiner(); }, 180);
      }));
      $("#valeur-libre").oninput = (ev) => { c[e.cle] = ev.target.value.trim(); $$("[data-v]", zone).forEach((x) => x.classList.remove("actif")); majBouton(); };
      $("#valeur-libre").onkeydown = (ev) => { if (ev.key === "Enter" && c[e.cle]) { ev.preventDefault(); c.etape++; dessiner(); } };
      const p = $("#precedent"); if (p) p.onclick = () => { c.etape--; dessiner(); };
      $("#suivant").onclick = () => { c.etape++; dessiner(); };
    };

    const ligne = (ic, nom, v) => `<div><span class="tl-ic">${ic}</span><b>${nom} :</b> ${v ? esc(v) : `<span class="discret">au choix de l'IA</span>`}</div>`;
    const recap = () => {
      const c = creation, d = c.details;
      zone.innerHTML = `<div class="progression"><div style="width:100%"></div></div>
        <h2>Récapitulatif</h2>
        <div class="tirage-lignes">
          ${ligne("🧬", "Race", c.race)}${ligne("🎭", "Rôle", c.role)}${ligne("🏰", "Lieu", c.lieu)}${ligne("👑", "Rang / métier", c.rang)}
          ${ligne("✦", "Magie", c.magie)}${ligne("⚑", "Faction", c.faction)}
          ${d.nom || d.age || d.genre || d.idees ? `<div><span class="tl-ic">✎</span><b>Détails :</b> ${esc([d.nom && "nom " + d.nom, d.age && "âge " + d.age, d.genre, d.idees].filter(Boolean).join(" · "))}</div>` : ""}
        </div>
        <div class="rangee"><button class="btn" id="precedent">← Modifier</button><button class="btn btn-or" id="generer">🤖 Créer la fiche</button><button class="lien" id="recommencer">Tout recommencer</button></div>
        <div id="resultat-creation"></div>`;
      $("#precedent").onclick = () => { c.etape = ETAPES.length - 1; dessiner(); };
      $("#recommencer").onclick = () => { creation = nouvelleCreation(); dessiner(); };
      $("#generer").onclick = async () => {
        const g = $("#generer"); g.disabled = true;
        const z = $("#resultat-creation");
        const stop = attenteIA(z, ["L'IA relit tout le wiki…", "Elle imagine le personnage…", "Elle vérifie la cohérence avec les autres fiches…", "Elle écrit son histoire…", "Elle remplit les cases d'infos…"]);
        try {
          const r = await avecDelai(api.ia("creer", { choix: { race: c.race, role: c.role, lieu: c.lieu, rang: c.rang, magie: c.magie, faction: c.faction, ...c.details } }));
          stop();
          const fiche = r.fiche;
          const champs = catParId("personnages").champs;
          pages.editeur.prefill = {
            categorie: "personnages", titre: fiche.titre, resume: fiche.resume, contenu: fiche.contenu,
            infos: Object.entries(fiche.infos || {}).map(([cle, valeur]) => ({ cle: champs.find((x) => normal(x) === normal(cle)) || cle, valeur: String(valeur) })),
          };
          z.innerHTML = `<div class="scenario">
            <h2>${esc(fiche.titre)}</h2>
            ${fiche.resume ? `<p class="fiche-resume">${esc(fiche.resume)}</p>` : ""}
            <div class="contenu ia-texte">${markdown(fiche.contenu)}</div>
            <div class="rangee"><button class="btn btn-or" id="ouvrir-editeur">✎ Relire et publier</button><button class="btn" id="regenerer">🔄 Une autre version</button></div>
            <p class="discret petit-texte">Rien n'est publié tant que tu n'as pas appuyé sur « Publier » dans le formulaire. ${NOTE_IA}</p></div>`;
          $("#ouvrir-editeur").onclick = () => { const pf = pages.editeur.prefill; creation = null; pages.editeur.prefill = pf; location.hash = "#/nouveau?cat=personnages"; };
          $("#regenerer").onclick = () => $("#generer").click();
        } catch (err) { stop(); z.innerHTML = `<p class="note erreur-note">⚠️ ${esc(err.message).replace(/\n/g, "<br>")}</p>`; }
        g.disabled = false;
      };
    };
    dessiner();
  };

  /* ---------- Roues de la chance : personnages, missions, difficulté ---------- */
  const COULEURS_ROUE = ["#e3b866", "#3b4a8c", "#7fc8f8", "#6a4c93", "#c9706b", "#2f6f6a", "#f5d08a", "#4b3b78", "#8fb8de", "#9c5a7a"];
  const CFG_MISSIONS = window.AETHERIA_MISSIONS || { MISSIONS: [], DIFFICULTES: [] };
  const lireLS = (k, defaut) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? defaut : v; } catch (e) { return defaut; } };
  const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const missionsDefaut = () => CFG_MISSIONS.MISSIONS.map((nom, i) => ({ nom, num: i + 1 }));
  const difficultesDefaut = () => CFG_MISSIONS.DIFFICULTES.map(([nom]) => ({ nom }));
  let ongletRoue = "persos";

  pages.roue = async (arg, params) => {
    await majIndexTitres();
    pages.roue.roues = (await api.listerRouesPerso().catch(() => [])).filter((r) => indexParId.has(r.fiche_id));
    const demande = params && params.get("roue");
    if (demande && pages.roue.roues.some((r) => r.id === demande)) { ongletRoue = "pouvoirs"; ecrireLS("aetheria_pouvoir_sel", demande); }
    if (ongletRoue === "pouvoirs" && !pages.roue.roues.length) ongletRoue = "persos";
    const onglets = [["persos", "👥", "Personnages"], ["missions", "📜", "Missions"], ["diff", "⭐", "Difficulté"], ["pouvoirs", "✨", "Pouvoirs"]];
    return `
      <div class="entete-page"><div><h1><span class="ic-titre">🎡</span>Roues de la chance</h1>
        <p class="discret">Tire une équipe, une mission de guilde et une difficulté, puis laisse l'IA imaginer le scénario.</p></div></div>

      <section class="panneau tirage" id="tirage"></section>

      <div class="modes onglets-roue">${onglets.map(([id, ic, nom]) => `<button class="mode ${id === ongletRoue ? "actif" : ""}" data-roue="${id}">${ic} ${nom}</button>`).join("")}</div>
      <section class="panneau roue-choix" id="roue-choix"></section>
      <div class="roue-zone">
        <div class="roue-cadre">
          <div class="roue-fleche"></div>
          <canvas id="roue" width="840" height="840"></canvas>
          <button class="roue-centre" id="roue-lancer" aria-label="Lancer la roue">Lancer</button>
        </div>
        <p class="discret roue-compte" id="roue-compte"></p>
      </div>`;
  };

  pages.roue.apres = () => {
    const persos = [...indexParId.values()].filter((f) => f.categorie === "personnages").sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
    const R = {
      persos: lireLS("aetheria_roue", []).filter((e) => !e.id || indexParId.has(e.id)).map((e) => (e.id ? { id: e.id, nom: indexParId.get(e.id).titre } : e)),
      missions: lireLS("aetheria_roue_missions", null) || missionsDefaut(),
      diff: lireLS("aetheria_roue_diff", null) || difficultesDefaut(),
    };
    const CLES = { persos: "aetheria_roue", missions: "aetheria_roue_missions", diff: "aetheria_roue_diff" };
    // Roues de pouvoirs : une roue choisie, et pour chaque roue la liste des cases encore dedans (comme un paquet de cartes)
    const ROUES = pages.roue.roues || [];
    let rouePouvoir = ROUES.find((r) => r.id === lireLS("aetheria_pouvoir_sel", null)) || ROUES[0] || null;
    const clePaquet = (r) => "aetheria_paquet_" + r.id;
    const chargerPaquet = () => {
      if (!rouePouvoir) { R.pouvoirs = []; return; }
      const els = rouePouvoir.elements || [];
      const reste = lireLS(clePaquet(rouePouvoir), null);
      const idx = Array.isArray(reste) ? reste.filter((k) => Number.isInteger(k) && k >= 0 && k < els.length) : els.map((_, k) => k);
      R.pouvoirs = idx.map((k) => ({ ...els[k], idx: k }));
    };
    chargerPaquet();
    const tirage = lireLS("aetheria_tirage", { equipe: [], mission: null, difficulte: null });
    let rotation = 0, enCours = false;
    const canvas = $("#roue"), ctx = canvas.getContext("2d");
    const roue = () => R[ongletRoue];
    const sauver = () => {
      if (ongletRoue === "pouvoirs") { if (rouePouvoir) { ecrireLS(clePaquet(rouePouvoir), R.pouvoirs.map((e) => e.idx)); ecrireLS("aetheria_pouvoir_sel", rouePouvoir.id); } }
      else ecrireLS(CLES[ongletRoue], roue());
      ecrireLS("aetheria_tirage", tirage);
    };
    const poids = (e) => (ongletRoue === "pouvoirs" ? Math.max(1, Math.min(20, Math.round(Number(e.poids) || 1))) : 1);
    // angles de chaque case, proportionnels à leur poids
    const parts = () => {
      const l = roue(), tot = l.reduce((t, e) => t + poids(e), 0) || 1;
      let c = 0;
      return l.map((e) => { const d = c, w = (poids(e) / tot) * 360; c += w; return { debut: d, largeur: w }; });
    };

    /* --- Résumé du tirage + scénario IA --- */
    let dernierScenario = "";
    const dessinerTirage = () => {
      dernierScenario = "";
      const descDiff = tirage.difficulte && (CFG_MISSIONS.DIFFICULTES.find(([n]) => n === tirage.difficulte) || [])[1];
      $("#tirage").innerHTML = `
        <h2>🎯 Tirage en cours</h2>
        <div class="tirage-lignes">
          <div><span class="tl-ic">👥</span><b>Équipe :</b> ${tirage.equipe.length ? tirage.equipe.map((e) => e.id ? `<a href="#/f/${encodeURIComponent(e.id)}">${esc(e.nom)}</a>` : esc(e.nom)).join(", ") : `<span class="discret">tourne la roue des personnages</span>`}</div>
          <div><span class="tl-ic">📜</span><b>Mission :</b> ${tirage.mission ? esc(tirage.mission) : `<span class="discret">tourne la roue des missions</span>`}</div>
          <div><span class="tl-ic">⭐</span><b>Difficulté :</b> ${tirage.difficulte ? `<span class="rang">${esc(tirage.difficulte)}</span> <small class="discret">${esc(descDiff || "")}</small>` : `<span class="discret">tourne la roue des difficultés</span>`}</div>
        </div>
        <div class="rangee">
          ${estMembre() ? `<button class="btn btn-or" id="imaginer" ${tirage.mission && tirage.difficulte ? "" : "disabled"}>🤖 Imaginer le scénario</button>` : ""}
          <button class="btn petit" id="vider-tirage">Nouveau tirage</button>
        </div>
        ${tirage.mission || tirage.difficulte || tirage.equipe.length ? htmlEnvoiDiscord("ed-tirage", "missions") : ""}
        ${!estMembre() ? `<p class="discret petit-texte">Connecte-toi avec un compte membre pour que l'IA imagine le scénario.</p>` : ""}
        <div id="scenario"></div>`;
      brancherEnvoiDiscord($("#ed-tirage"), () => ({ type: "tirage", equipe: tirage.equipe.map((e) => e.nom), mission: tirage.mission, difficulte: tirage.difficulte, description: descDiff || "", scenario: dernierScenario }));
      $("#vider-tirage").onclick = () => { tirage.equipe = []; tirage.mission = null; tirage.difficulte = null; ecrireLS("aetheria_tirage", tirage); dessinerTirage(); };
      const im = $("#imaginer");
      if (im) im.onclick = async () => {
        const z = $("#scenario");
        im.disabled = true;
        const stop = attenteIA(z, ["L'IA lit la mission…", "Elle cherche des lieux et des créatures dans le wiki…", "Elle dose la difficulté…", "Elle prépare un rebondissement…", "Elle rédige le scénario…"]);
        try {
          const r = await avecDelai(api.ia("scenario", { mission: tirage.mission, difficulte: tirage.difficulte, description: descDiff || "", personnages: tirage.equipe.map((e) => e.nom) }));
          stop();
          dernierScenario = r.texte;
          z.innerHTML = `<div class="scenario"><div class="contenu ia-texte">${markdown(r.texte)}</div>
            <div class="rangee"><button class="btn petit" id="copier-scenario">📋 Copier</button>${estMembre() ? `<button class="btn petit btn-or" id="chronique-scenario">📜 En faire une chronique</button>` : ""}</div>
            <p class="discret petit-texte">${NOTE_IA}</p></div>`;
          $("#copier-scenario").onclick = () => copier(r.texte);
          const ch = $("#chronique-scenario");
          if (ch) ch.onclick = () => {
            pages.editeur.prefill = {
              categorie: "chroniques",
              titre: `Mission ${tirage.difficulte} — ${tirage.mission}`.slice(0, 120),
              resume: tirage.mission.slice(0, 400),
              infos: [{ cle: "Participants", valeur: tirage.equipe.map((e) => e.nom).join(", ") }, { cle: "Arc / Campagne", valeur: "Mission de guilde (rang " + tirage.difficulte + ")" }],
              contenu: r.texte,
            };
            location.hash = "#/nouveau?cat=chroniques";
          };
        } catch (e) { stop(); z.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message).replace(/\n/g, "<br>")}</p>`; }
        im.disabled = false;
      };
    };

    /* --- Choix des éléments selon l'onglet --- */
    const dessinerChoix = () => {
      const z = $("#roue-choix");
      if (ongletRoue === "persos") {
        const dans = (id) => R.persos.some((e) => e.id === id);
        z.innerHTML = `
          <div class="rangee roue-outils"><input id="roue-filtre" type="search" placeholder="Chercher un personnage…"><button class="btn petit" id="roue-tous">Tout ajouter</button><button class="btn petit btn-danger" id="roue-vider">Vider</button></div>
          <div class="roue-noms" id="roue-noms"></div>
          <form class="rangee roue-ajout" id="roue-ajout"><input name="nom" maxlength="40" placeholder="Ajouter un autre nom (PNJ, joueur…)"><button class="btn petit">Ajouter</button></form>`;
        const noms = () => {
          const q = normal($("#roue-filtre").value);
          const vis = persos.filter((f) => !q || normal(f.titre).includes(q));
          $("#roue-noms").innerHTML = vis.map((f) => `<button type="button" class="nom-roue ${dans(f.id) ? "actif" : ""}" data-id="${esc(f.id)}">${dans(f.id) ? "✓ " : ""}${esc(f.titre)}</button>`).join("") +
            R.persos.filter((e) => !e.id).map((e) => `<button type="button" class="nom-roue actif libre" data-libre="${esc(e.nom)}">✓ ${esc(e.nom)} <span aria-hidden="true">✕</span></button>`).join("") ||
            `<p class="discret">${persos.length ? "Aucun personnage trouvé." : "Aucune fiche de personnage : ajoute des noms à la main."}</p>`;
          $$("[data-id]", z).forEach((b) => (b.onclick = () => { if (enCours) return; const id = b.dataset.id; R.persos = dans(id) ? R.persos.filter((e) => e.id !== id) : [...R.persos, { id, nom: indexParId.get(id).titre }]; majTout(); }));
          $$("[data-libre]", z).forEach((b) => (b.onclick = () => { if (enCours) return; R.persos = R.persos.filter((e) => e.id || e.nom !== b.dataset.libre); majTout(); }));
        };
        $("#roue-filtre").oninput = noms;
        $("#roue-tous").onclick = () => { if (enCours) return; persos.forEach((f) => { if (!dans(f.id)) R.persos.push({ id: f.id, nom: f.titre }); }); majTout(); };
        $("#roue-vider").onclick = () => { if (!enCours && R.persos.length && confirm("Retirer tous les noms de la roue ?")) { R.persos = []; majTout(); } };
        $("#roue-ajout").onsubmit = (e) => { e.preventDefault(); const nom = e.target.nom.value.trim(); if (!nom || enCours) return; if (R.persos.some((x) => normal(x.nom) === normal(nom))) return toast("Ce nom est déjà dans la roue.", "erreur"); R.persos.push({ nom }); e.target.nom.value = ""; majTout(); };
        noms();
      } else if (ongletRoue === "missions") {
        z.innerHTML = `
          <div class="rangee roue-outils"><input id="roue-filtre" type="search" placeholder="Chercher une mission…"><button class="btn petit" id="roue-reset">Remettre les ${CFG_MISSIONS.MISSIONS.length}</button></div>
          <details class="liste-missions"><summary>Voir les ${R.missions.length} missions dans la roue</summary><ol id="roue-missions"></ol></details>
          <form class="rangee roue-ajout" id="roue-ajout"><input name="nom" maxlength="200" placeholder="Ajouter une mission inventée…"><button class="btn petit">Ajouter</button></form>`;
        const liste = () => {
          const q = normal($("#roue-filtre").value);
          $("#roue-missions").innerHTML = R.missions.map((m, i) => ({ m, i })).filter(({ m }) => !q || normal(m.nom).includes(q))
            .map(({ m, i }) => `<li><span class="num-mission">${m.num ? "N°" + m.num : "★"}</span> ${esc(m.nom)} <button type="button" class="lien" data-retirer-m="${i}" aria-label="Retirer">✕</button></li>`).join("") || `<p class="discret">Aucune mission.</p>`;
          $$("[data-retirer-m]", z).forEach((b) => (b.onclick = () => { if (enCours) return; R.missions.splice(+b.dataset.retirerM, 1); majTout(); }));
        };
        $("#roue-filtre").oninput = () => { $(".liste-missions").open = true; liste(); };
        $("#roue-reset").onclick = () => { if (!enCours && confirm("Remettre toutes les missions dans la roue ?")) { R.missions = missionsDefaut(); majTout(); } };
        $("#roue-ajout").onsubmit = (e) => { e.preventDefault(); const nom = e.target.nom.value.trim(); if (!nom || enCours) return; R.missions.push({ nom }); e.target.nom.value = ""; majTout(); };
        liste();
      } else if (ongletRoue === "pouvoirs") {
        if (!ROUES.length) { z.innerHTML = `<p class="discret">Aucune roue de pouvoirs pour l'instant. Ouvre la fiche d'un personnage dont les pouvoirs reposent sur le hasard (cartes, dés, runes…) et appuie sur « 🤖 Proposer des roues ».</p>`; return; }
        const persosR = [...new Set(ROUES.map((r) => r.fiche_id))].map((id) => indexParId.get(id)).sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
        const duPerso = ROUES.filter((r) => r.fiche_id === rouePouvoir.fiche_id);
        const els = rouePouvoir.elements || [], sortis = els.map((e, k) => ({ ...e, idx: k })).filter((e) => !R.pouvoirs.some((x) => x.idx === e.idx));
        const f = indexParId.get(rouePouvoir.fiche_id);
        z.innerHTML = `
          <div class="rangee roue-outils">
            <label class="champ-court">Personnage<select id="pv-perso">${persosR.map((p) => `<option value="${esc(p.id)}" ${p.id === rouePouvoir.fiche_id ? "selected" : ""}>${esc(p.titre)}</option>`).join("")}</select></label>
            <label class="champ-court">Roue<select id="pv-roue">${duPerso.map((r) => `<option value="${esc(r.id)}" ${r.id === rouePouvoir.id ? "selected" : ""}>${esc(r.nom)}</option>`).join("")}</select></label>
          </div>
          ${rouePouvoir.description ? `<p class="discret">${esc(rouePouvoir.description)}</p>` : ""}
          <div class="rangee"><a class="lien" href="#/f/${encodeURIComponent(f.id)}">Fiche de ${esc(f.titre)}</a>
            <button class="btn petit" id="pv-remettre" ${sortis.length ? "" : "disabled"}>🔀 Remettre tout (${sortis.length} retirée${sortis.length > 1 ? "s" : ""})</button></div>
          <details class="liste-missions"><summary>Voir les ${R.pouvoirs.length} cases restantes</summary>
            <ol class="liste-pouvoirs">${R.pouvoirs.map((e) => `<li><b>${esc(e.nom)}</b>${poids(e) > 1 ? ` <small class="discret">×${poids(e)}</small>` : ""}${e.effet ? ` — <span class="discret">${esc(e.effet)}</span>` : ""}</li>`).join("")}</ol></details>
          ${sortis.length ? `<details class="liste-missions"><summary>Déjà retirées (${sortis.length})</summary><ol class="liste-pouvoirs">${sortis.map((e) => `<li>${esc(e.nom)}</li>`).join("")}</ol></details>` : ""}`;
        const changer = (r) => { if (enCours || !r) return; rouePouvoir = r; ecrireLS("aetheria_pouvoir_sel", r.id); chargerPaquet(); canvas.style.transition = "none"; rotation = 0; canvas.style.transform = "rotate(0deg)"; majTout(); };
        $("#pv-perso").onchange = (e) => changer(ROUES.find((r) => r.fiche_id === e.target.value));
        $("#pv-roue").onchange = (e) => changer(ROUES.find((r) => r.id === e.target.value));
        $("#pv-remettre").onclick = () => { if (enCours) return; R.pouvoirs = els.map((e, k) => ({ ...e, idx: k })); canvas.style.transition = "none"; rotation = 0; canvas.style.transform = "rotate(0deg)"; majTout(); toast("Toutes les cases sont revenues dans la roue."); };
      } else {
        const dans = (n) => R.diff.some((d) => d.nom === n);
        z.innerHTML = `<p class="discret">Touche un rang pour le retirer ou le remettre dans la roue.</p>
          <div class="roue-noms">${CFG_MISSIONS.DIFFICULTES.map(([n, d]) => `<button type="button" class="nom-roue ${dans(n) ? "actif" : ""}" data-rang="${esc(n)}" title="${esc(d)}">${dans(n) ? "✓ " : ""}Rang ${esc(n)}</button>`).join("")}</div>`;
        $$("[data-rang]", z).forEach((b) => (b.onclick = () => {
          if (enCours) return;
          const n = b.dataset.rang;
          R.diff = dans(n) ? R.diff.filter((d) => d.nom !== n) : CFG_MISSIONS.DIFFICULTES.map(([x]) => x).filter((x) => x === n || dans(x)).map((x) => ({ nom: x }));
          majTout();
        }));
      }
    };

    /* --- Dessin de la roue --- */
    const etiquette = (e) => {
      if (ongletRoue === "missions") return R.missions.length > 14 ? (e.num ? "N°" + e.num : "★") : e.nom;
      if (ongletRoue === "diff") return e.nom;
      return e.nom;
    };
    const dessinerRoue = () => {
      const l = roue(), W = canvas.width, Rr = W / 2 - 10;
      ctx.clearRect(0, 0, W, W);
      ctx.save(); ctx.translate(W / 2, W / 2);
      ctx.beginPath(); ctx.arc(0, 0, Rr + 6, 0, Math.PI * 2); ctx.fillStyle = "#e3b866"; ctx.fill();
      if (!l.length) { ctx.beginPath(); ctx.arc(0, 0, Rr, 0, Math.PI * 2); ctx.fillStyle = "#151a36"; ctx.fill(); ctx.restore(); return; }
      const n = l.length, P = parts();
      l.forEach((e, i) => {
        const a = (P[i].largeur * Math.PI) / 180, debut = -Math.PI / 2 + (P[i].debut * Math.PI) / 180;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Rr, debut, debut + a); ctx.closePath();
        let coul = COULEURS_ROUE[i % COULEURS_ROUE.length];
        if (n > 1 && i === n - 1 && coul === COULEURS_ROUE[0]) coul = COULEURS_ROUE[2];
        ctx.fillStyle = coul; ctx.fill();
        ctx.strokeStyle = "rgba(13,16,36,0.6)"; ctx.lineWidth = n > 40 ? 1.5 : 3; ctx.stroke();
        ctx.save(); ctx.rotate(debut + a / 2);
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillStyle = ["#e3b866", "#7fc8f8", "#f5d08a", "#8fb8de"].includes(coul) ? "#0d1024" : "#ffffff";
        const taille = Math.max(13, Math.min(46, (520 / n + 12) * Math.min(1.6, Math.sqrt(P[i].largeur / (360 / n)))));
        ctx.font = `600 ${taille}px "Cinzel", Georgia, serif`;
        let t = etiquette(e); const max = Rr - 90;
        while (ctx.measureText(t).width > max && t.length > 2) t = t.slice(0, -1);
        if (t !== etiquette(e)) t = t.slice(0, -1) + "…";
        ctx.fillText(t, Rr - 20, 0);
        ctx.restore();
      });
      ctx.restore();
    };

    const majTout = (choix = true) => {
      sauver();
      if (choix) dessinerChoix();
      dessinerRoue();
      const n = roue().length, mot = { persos: "nom", missions: "mission", diff: "rang", pouvoirs: "case" }[ongletRoue];
      $("#roue-compte").textContent = n ? `${n} ${mot}${n > 1 ? "s" : ""} dans la roue` : "La roue est vide";
      $("#roue-lancer").disabled = n < 2;
      const d = ongletRoue === "missions" && $(".liste-missions summary"); if (d) d.textContent = `Voir les ${R.missions.length} missions dans la roue`;
    };

    $$("[data-roue]").forEach((b) => (b.onclick = () => {
      if (enCours) return;
      ongletRoue = b.dataset.roue;
      $$("[data-roue]").forEach((x) => x.classList.toggle("actif", x === b));
      canvas.style.transition = "none"; rotation = 0; canvas.style.transform = "rotate(0deg)";
      majTout();
    }));

    $("#roue-lancer").onclick = () => {
      const l = roue();
      if (enCours || l.length < 2) return;
      enCours = true; $("#roue-lancer").disabled = true;
      const P = parts();
      const h = crypto.getRandomValues(new Uint32Array(2));
      const tire = (h[0] / 4294967296) * 360;
      let gagnant = P.findIndex((p) => tire < p.debut + p.largeur);
      if (gagnant < 0) gagnant = l.length - 1;
      const pos = P[gagnant].debut + P[gagnant].largeur * (0.15 + 0.7 * (h[1] / 4294967296));
      const cible = (360 - pos + 3600) % 360;
      const actuel = ((rotation % 360) + 360) % 360;
      rotation += 360 * 6 + ((cible - actuel + 360) % 360);
      canvas.style.transition = "transform 5.5s cubic-bezier(0.12, 0.7, 0.1, 1)";
      canvas.style.transform = `rotate(${rotation}deg)`;
      setTimeout(() => { enCours = false; resultat(gagnant); }, 5700);
    };

    const resultat = (i) => {
      const onglet = ongletRoue, e = roue()[i];
      // on enregistre le tirage
      if (onglet === "persos") { if (!tirage.equipe.some((x) => x.nom === e.nom)) tirage.equipe.push({ nom: e.nom, id: e.id || null }); }
      else if (onglet === "missions") tirage.mission = e.nom;
      else if (onglet === "diff") tirage.difficulte = e.nom;
      ecrireLS("aetheria_tirage", tirage);
      dessinerTirage();
      const titre = { persos: "La roue a choisi", missions: "Mission tirée", diff: "Difficulté", pouvoirs: rouePouvoir ? rouePouvoir.nom : "Pouvoir" }[onglet];
      const desc = onglet === "diff" ? (CFG_MISSIONS.DIFFICULTES.find(([n]) => n === e.nom) || [])[1] : onglet === "pouvoirs" ? e.effet || "" : "";
      const fond = document.createElement("div");
      fond.className = "feuille-fond resultat-roue";
      fond.innerHTML = `
        <div class="carte-resultat">
          <div class="cr-titre">✧ ${titre} ✧</div>
          <div class="cr-nom ${onglet === "missions" ? "cr-mission" : ""}">${onglet === "diff" ? "Rang " : ""}${esc(e.nom)}</div>
          ${desc ? `<p class="${onglet === "pouvoirs" ? "cr-effet" : "discret"}">${inline(esc(desc))}</p>` : ""}
          ${e.id ? `<a class="lien" href="#/f/${encodeURIComponent(e.id)}">Voir sa fiche</a>` : ""}
          ${onglet === "persos" ? `<p class="discret petit-texte">Ajouté à l'équipe du tirage.</p>` : ""}
          ${onglet === "pouvoirs" ? htmlEnvoiDiscord("ed-roue") : ""}
          ${onglet === "pouvoirs" ? `<p class="discret petit-texte">« Retirer » la défausse (comme une carte jouée) jusqu'à « Remettre tout ».</p>` : ""}
          <div class="cr-boutons">
            <button class="btn btn-danger" id="cr-retirer">🗑 Retirer de la roue</button>
            ${onglet === "pouvoirs" ? `<button class="btn" id="cr-copier">📋 Copier</button>` : ""}
            <button class="btn btn-or" id="cr-garder">✔ Garder</button>
          </div>
        </div>`;
      document.body.appendChild(fond);
      requestAnimationFrame(() => fond.classList.add("ouvert"));
      const fermer = () => { fond.remove(); window.removeEventListener("hashchange", fermer); };
      window.addEventListener("hashchange", fermer);
      $("#cr-garder", fond).onclick = () => { fermer(); majTout(); };
      if (onglet === "pouvoirs") {
        const rp = rouePouvoir, fp = rp && indexParId.get(rp.fiche_id);
        brancherEnvoiDiscord($("#ed-roue", fond), () => ({ type: "roue", roue: rp ? rp.nom : "", perso: fp ? fp.titre : "", nom: e.nom, effet: e.effet || "" }));
      }
      const cc = $("#cr-copier", fond);
      if (cc) cc.onclick = () => copier(`${titre} : ${e.nom}${e.effet ? " — " + e.effet : ""}`);
      $("#cr-retirer", fond).onclick = () => {
        R[onglet].splice(i, 1);
        canvas.style.transition = "none"; rotation = 0; canvas.style.transform = "rotate(0deg)";
        fermer(); majTout();
      };
    };

    dessinerTirage();
    majTout();
  };

  /* =====================================================================
     MINI-JEUX : Aetherdle, Qui suis-je ?, Bataille de cartes, Grand Tournoi
     ===================================================================== */
  const JEUX = [
    ["duel", "🥊", "Duel", "Jeu de combat : tes personnages s'affrontent façon Street Fighter, contre l'ordi, à deux ou en ligne."],
    ["rpg", "⚔️", "Aetheria Tactics", "RPG gacha : collectionne les personnages, monte ton équipe de 5 et combats."],
    ["aetherdle", "🔍", "Aetherdle", "Le personnage du jour : devine-le en un minimum d'essais."],
    ["qui", "🕵️", "Qui suis-je ?", "Des indices de plus en plus clairs : trouve le personnage avant la fin."],
    ["cartes", "🃏", "Bataille de cartes", "Ton deck de personnages contre celui de l'ordinateur, aux vrais dés."],
    ["tournoi", "🏆", "Grand Tournoi", "Tous les personnages s'affrontent jusqu'au champion."],
  ];
  const alea = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const d15 = () => 1 + alea(DE);
  const melanger = (t) => { const a = [...t]; for (let i = a.length - 1; i > 0; i--) { const j = alea(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hachage = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const jourLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const numeroJour = (j) => Math.round((new Date(j + "T12:00:00") - new Date("2026-11-11T12:00:00")) / 86400000) + 1;
  const persosJeu = () => [...indexParId.values()].filter(estPerso).sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
  const infoPerso = (f, re) => { const i = (f.infos || []).find((x) => re.test(normal(x.cle)) && String(x.valeur || "").trim()); return i ? sansMarkdown(i.valeur).replace(/\s+/g, " ").trim().slice(0, 60) : ""; };
  const CHAMPS_JEU = [
    ["Race", /race|peuple|espece/],
    ["Rôle", /role|classe|metier/],
    ["Affiliation", /affiliation|faction|guilde/],
    ["Origine", /lieu|origine|royaume/],
    ["Statut", /statut/],
  ];
  let desJeux = {};
  const forces = (f) => { const b = bonusFiche(f, desJeux); return { attaque: b.attaque.bonus, defense: b.defense.bonus, soutien: b.soutien.bonus }; };
  const puissance = (f) => { const x = forces(f); return x.attaque + x.defense + x.soutien; };
  const vignette = (f, cls = "") => urlSure(f.image_url) ? `<img class="vignette ${cls}" src="${esc(f.image_url)}" alt="" loading="lazy">` : `<span class="vignette sans-image ${cls}">${esc((f.titre || "?").slice(0, 1))}</span>`;
  const enTete = (ic, nom, sous) => `<div class="fil"><a href="#/jeux">🎮 Mini-jeux</a></div>
    <div class="entete-page"><div><h1><span class="ic-titre">${ic}</span>${esc(nom)}</h1>${sous ? `<p class="discret">${sous}</p>` : ""}</div></div>`;
  async function sauverScore(jeu, score, details) {
    if (!estMembre()) return;
    try { await api.enregistrerScore({ jeu, jour: jourLocal(), score, details }); } catch (e) { console.warn(e); }
  }
  const champSaisie = (id, persos, ph) => `<form class="rangee jeu-saisie" id="${id}">
      <input name="nom" list="${id}-liste" autocomplete="off" placeholder="${esc(ph)}" required>
      <datalist id="${id}-liste">${persos.map((f) => `<option value="${esc(f.titre)}">`).join("")}</datalist>
      <button class="btn btn-or">Valider</button></form>`;
  const trouverPerso = (persos, nom) => persos.find((f) => normal(f.titre) === normal(nom));

  /* ---------- Menu ---------- */
  pages.jeux = async (arg) => {
    const [fiches, des] = await Promise.all([majIndexTitres(), api.listerDes().catch(() => ({}))]);
    desJeux = des || {};
    const persos = fiches.filter(estPerso);
    if (arg && pages.jeux[arg]) return pages.jeux[arg](persos);
    const depuis = jourLocal(new Date(Date.now() - 30 * 86400000));
    const [scores, auteurs] = await Promise.all([api.listerScores(depuis).catch(() => []), auteursMap()]);
    const pseudo = (id) => esc((auteurs.get(id) || {}).pseudo || "?");
    const auj = jourLocal();
    const dle = scores.filter((s) => s.jeu === "aetherdle" && s.jour === auj).sort((a, b) => a.score - b.score || a.cree_le.localeCompare(b.cree_le));
    const somme = (jeu) => {
      const m = new Map();
      scores.filter((s) => s.jeu === jeu).forEach((s) => m.set(s.user_id, (m.get(s.user_id) || 0) + s.score));
      return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
    };
    const series = (() => {
      const parJoueur = new Map();
      scores.filter((s) => s.jeu === "aetherdle").forEach((s) => { if (!parJoueur.has(s.user_id)) parJoueur.set(s.user_id, new Set()); parJoueur.get(s.user_id).add(s.jour); });
      const hier = jourLocal(new Date(Date.now() - 86400000));
      return [...parJoueur.entries()].map(([id, jours]) => {
        let n = 0, d = new Date(); if (!jours.has(auj)) { if (!jours.has(hier)) return [id, 0]; d = new Date(Date.now() - 86400000); }
        while (jours.has(jourLocal(d))) { n++; d = new Date(d.getTime() - 86400000); }
        return [id, n];
      }).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 10);
    })();
    const tableau = (titre, lignes, unite) => `<div class="classement-bloc"><h3>${titre}</h3>${lignes.length ? `<ol class="classement">${lignes.map(([id, v], i) => `<li><span class="cl-rang">${["🥇", "🥈", "🥉"][i] || i + 1}</span><span class="cl-nom">${pseudo(id)}</span><b>${v}</b> <small class="discret">${unite(v)}</small></li>`).join("")}</ol>` : `<p class="discret petit-texte">Personne pour l'instant.</p>`}</div>`;
    return `
      <div class="entete-page"><div><h1><span class="ic-titre">🎮</span>Mini-jeux</h1>
        <p class="discret">Des jeux avec les personnages du wiki.${persos.length < 2 ? " Il faut au moins deux fiches de personnage pour jouer." : ""}</p></div></div>
      <div class="grille-jeux">${JEUX.map(([id, ic, nom, desc]) => `
        <a class="carte-jeu" href="#/jeux/${id}"><span class="cj-ic">${ic}</span><span class="cj-nom">${esc(nom)}</span><span class="discret petit-texte">${esc(desc)}</span></a>`).join("")}</div>
      <h2 class="titre-section">🏅 Classements</h2>
      ${!estMembre() ? `<p class="discret petit-texte">Connecte-toi avec un compte membre pour que tes scores comptent.</p>` : ""}
      <div class="classements">
        ${tableau(`🔍 Aetherdle n°${numeroJour(auj)} (aujourd'hui)`, dle.map((s) => [s.user_id, s.score]), (v) => "essai" + (v > 1 ? "s" : ""))}
        ${tableau("🔥 Séries Aetherdle", series, () => "jours de suite")}
        ${tableau("🕵️ Qui suis-je ? (30 jours)", somme("qui"), () => "points")}
        ${tableau("🃏 Bataille de cartes (30 jours)", somme("cartes"), (v) => "victoire" + (v > 1 ? "s" : ""))}
        ${tableau("🏆 Pronostics du tournoi (30 jours)", somme("tournoi"), () => "bons pronostics")}
        ${tableau("🥊 Duel en ligne (30 jours)", somme("duel_ligne"), (v) => "victoire" + (v > 1 ? "s" : ""))}
        ${tableau("🕹️ Arcade (meilleur score)", (() => { const m = new Map(); scores.filter((x) => x.jeu === "arcade").forEach((x) => { const v = (x.details && x.details.score) || x.score * 100; if (!m.has(x.user_id) || m.get(x.user_id) < v) m.set(x.user_id, v); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10); })(), () => "points")}
      </div>`;
  };
  pages.jeux.apres = (arg) => { if (arg && pages.jeux[arg] && pages.jeux[arg].apres) pages.jeux[arg].apres(); };

  /* ---------- Aetherdle ---------- */
  const candidatsDle = (persos) => persos.filter((f) => CHAMPS_JEU.filter(([, re]) => infoPerso(f, re)).length >= 2);
  const secretDu = (cands, jour) => cands.reduce((m, f) => (!m || hachage(jour + "|" + f.id) < hachage(jour + "|" + m.id) ? f : m), null);
  const motsDe = (t) => normal(t).split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !["les", "des", "del", "une", "the"].includes(m));
  function comparer(a, b) {
    if (!a && !b) return "vert";
    if (!a || !b) return "rouge";
    if (normal(a) === normal(b)) return "vert";
    const mb = new Set(motsDe(b));
    return motsDe(a).some((m) => mb.has(m)) ? "orange" : "rouge";
  }
  pages.jeux.aetherdle = (persos) => {
    const cands = candidatsDle(persos);
    if (cands.length < 2) return enTete("🔍", "Aetherdle") + `<p class="note">Il faut au moins deux personnages dont la fiche a des infos remplies (race, rôle, affiliation, lieu d'origine, statut).</p>`;
    const jour = jourLocal(), hier = jourLocal(new Date(Date.now() - 86400000));
    const secretHier = secretDu(cands, hier);
    return enTete("🔍", `Aetherdle n°${numeroJour(jour)}`, "Un personnage secret par jour, le même pour tout le monde. Propose un nom : chaque case te dit si tu chauffes.") + `
      <section class="panneau">
        ${champSaisie("dle-form", persos, "Nom d'un personnage…")}
        <div class="legende-dle"><span class="cdle vert">juste</span><span class="cdle orange">en partie</span><span class="cdle rouge">faux</span><span class="cdle">⬆️ secret plus puissant</span><span class="cdle">⬇️ moins puissant</span></div>
        <div class="dle-grille" id="dle-grille"></div>
        <div id="dle-fin"></div>
      </section>
      ${secretHier ? `<p class="discret petit-texte">Le personnage d'hier était : <a href="#/f/${encodeURIComponent(secretHier.id)}">${esc(secretHier.titre)}</a></p>` : ""}`;
  };
  pages.jeux.aetherdle.apres = () => {
    const persos = persosJeu(), cands = candidatsDle(persos);
    if (cands.length < 2) return;
    const jour = jourLocal(), secret = secretDu(cands, jour), cle = "aetherdle_" + jour;
    let essais = lireLS(cle, []).filter((id) => indexParId.has(id));
    const ligne = (f) => {
      const cases = CHAMPS_JEU.map(([nom, re]) => { const v = infoPerso(f, re); return { nom, v: v || "—", c: comparer(v, infoPerso(secret, re)) }; });
      const p = puissance(f), ps = puissance(secret);
      cases.push({ nom: "Puissance", v: p + (p === ps ? "" : p < ps ? " ⬆️" : " ⬇️"), c: p === ps ? "vert" : Math.abs(p - ps) <= 5 ? "orange" : "rouge" });
      return cases;
    };
    const emoji = { vert: "🟩", orange: "🟨", rouge: "🟥" };
    const dessiner = () => {
      const gagne = essais.includes(secret.id);
      $("#dle-grille").innerHTML = essais.length ? `<div class="dle-ligne dle-tete"><span>Perso</span>${[...CHAMPS_JEU.map(([n]) => n), "Puissance"].map((n) => `<span>${n}</span>`).join("")}</div>` +
        [...essais].reverse().map((id) => { const f = indexParId.get(id); return `<div class="dle-ligne"><span class="cdle perso ${id === secret.id ? "vert" : ""}">${vignette(f)}<small>${esc(f.titre)}</small></span>${ligne(f).map((c) => `<span class="cdle ${c.c}">${esc(c.v)}</span>`).join("")}</div>`; }).join("") : "";
      $("#dle-form").hidden = gagne;
      if (gagne) {
        const n = essais.length;
        const partage = `🔍 Aetherdle n°${numeroJour(jour)} — trouvé en ${n} essai${n > 1 ? "s" : ""}\n` + essais.map((id) => ligne(indexParId.get(id)).map((c) => emoji[c.c]).join("")).join("\n") + `\n${location.origin + location.pathname}#/jeux/aetherdle`;
        $("#dle-fin").innerHTML = `<div class="jeu-victoire"><div class="jv-titre">🎉 Trouvé en ${n} essai${n > 1 ? "s" : ""} !</div>
          <p>C'était <a href="#/f/${encodeURIComponent(secret.id)}">${esc(secret.titre)}</a>. Reviens demain pour un nouveau personnage.</p>
          <pre class="partage-dle">${esc(partage)}</pre>
          <div class="rangee"><button class="btn btn-or" id="dle-copier">📋 Copier pour Discord</button></div></div>`;
        $("#dle-copier").onclick = () => copier(partage);
        if (!lireLS(cle + "_envoye", false)) { ecrireLS(cle + "_envoye", true); sauverScore("aetherdle", n, { essais }); }
      } else $("#dle-fin").innerHTML = essais.length ? `<p class="discret petit-texte">${essais.length} essai${essais.length > 1 ? "s" : ""}…</p>` : "";
    };
    $("#dle-form").onsubmit = (e) => {
      e.preventDefault();
      const f = trouverPerso(persos, e.target.nom.value);
      if (!f) return toast("Ce personnage n'existe pas dans le wiki.", "erreur");
      if (essais.includes(f.id)) return toast("Tu l'as déjà proposé.", "erreur");
      essais.push(f.id); ecrireLS(cle, essais); e.target.nom.value = ""; dessiner();
    };
    dessiner();
  };

  /* ---------- Qui suis-je ? ---------- */
  function indicesDe(f) {
    // du plus vague au plus révélateur
    const champ = (nom) => { const [, re] = CHAMPS_JEU.find(([n]) => n === nom); const v = infoPerso(f, re); return v ? `${nom} : <b>${esc(v)}</b>` : null; };
    const x = forces(f);
    const l = [champ("Statut"), `Ses dés : ⚔️ ${signe(x.attaque)} · 🛡️ ${signe(x.defense)} · 💚 ${signe(x.soutien)}`, champ("Rôle"), champ("Origine"), champ("Affiliation"), champ("Race")].filter(Boolean);
    if (f.resume) {
      // on cache le nom du personnage dans son résumé
      let r = sansMarkdown(f.resume).normalize("NFD");
      motsDe(f.titre).forEach((m) => { r = r.replace(new RegExp(m.split("").map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\u0300-\\u036f]*").join(""), "gi"), "███"); });
      r = r.normalize("NFC");
      l.push(`On dit de lui ou d'elle : « ${esc(r.slice(0, 220))} »`);
    }
    if (urlSure(f.image_url)) l.push(`<img class="indice-image" src="${esc(f.image_url)}" alt="">`);
    return l;
  }
  pages.jeux.qui = (persos) => {
    if (persos.filter((f) => indicesDe(f).length >= 3).length < 2) return enTete("🕵️", "Qui suis-je ?") + `<p class="note">Il faut au moins deux personnages avec assez d'infos sur leur fiche.</p>`;
    return enTete("🕵️", "Qui suis-je ?", "Moins tu utilises d'indices, plus tu gagnes de points. Une mauvaise réponse dévoile l'indice suivant.") + `
      <section class="panneau"><div id="qui-zone"></div></section>`;
  };
  pages.jeux.qui.apres = () => {
    const persos = persosJeu(), jouables = persos.filter((f) => indicesDe(f).length >= 3);
    let total = 0, joues = 0, deja = [];
    const manche = () => {
      const libres = jouables.filter((f) => !deja.includes(f.id));
      if (!libres.length) deja = [];
      const f = (libres.length ? libres : jouables)[alea((libres.length ? libres : jouables).length)];
      deja.push(f.id);
      const ind = indicesDe(f), max = ind.length;
      let vus = 1, fini = false;
      const dessiner = (msg) => {
        const pts = Math.max(1, max + 1 - vus);
        $("#qui-zone").innerHTML = `
          <div class="qui-score">Score : <b>${total}</b> point${total > 1 ? "s" : ""} · ${joues} personnage${joues > 1 ? "s" : ""}</div>
          <ol class="indices">${ind.slice(0, vus).map((t) => `<li>${t}</li>`).join("")}</ol>
          ${fini ? "" : `<p class="discret petit-texte">Indice ${vus}/${max} · trouve-le maintenant pour <b>${pts}</b> point${pts > 1 ? "s" : ""}</p>
          ${champSaisie("qui-form", persos, "C'est qui ?")}
          <div class="rangee"><button class="btn petit" id="qui-indice" ${vus >= max ? "disabled" : ""}>💡 Indice suivant</button><button class="btn petit btn-danger" id="qui-abandon">Abandonner</button></div>`}
          ${msg || ""}`;
        if (fini) { $("#qui-suivant").onclick = manche; return; }
        $("#qui-indice").onclick = () => { vus = Math.min(max, vus + 1); dessiner(); };
        $("#qui-abandon").onclick = () => { fini = true; joues++; dessiner(`<div class="jeu-defaite">C'était <a href="#/f/${encodeURIComponent(f.id)}">${esc(f.titre)}</a>.</div><button class="btn btn-or" id="qui-suivant">Personnage suivant →</button>`); };
        $("#qui-form").onsubmit = (e) => {
          e.preventDefault();
          const g = trouverPerso(persos, e.target.nom.value);
          if (!g) return toast("Ce personnage n'existe pas dans le wiki.", "erreur");
          if (g.id === f.id) {
            fini = true; total += pts; joues++;
            sauverScore("qui", pts, { fiche: f.id, indices: vus });
            dessiner(`<div class="jeu-victoire"><div class="jv-titre">🎉 Bravo, c'est ${esc(f.titre)} ! +${pts} point${pts > 1 ? "s" : ""}</div>${vignette(f, "grande")}</div><button class="btn btn-or" id="qui-suivant">Personnage suivant →</button>`);
          } else if (vus >= max) {
            fini = true; joues++;
            dessiner(`<div class="jeu-defaite">Raté, ce n'est pas ${esc(g.titre)}. C'était <a href="#/f/${encodeURIComponent(f.id)}">${esc(f.titre)}</a>.</div><button class="btn btn-or" id="qui-suivant">Personnage suivant →</button>`);
          } else { vus++; dessiner(`<p class="note erreur-note">Non, ce n'est pas ${esc(g.titre)}. Nouvel indice !</p>`); }
        };
      };
      dessiner();
    };
    manche();
  };

  /* ---------- Bataille de cartes ---------- */
  const STATS = [["attaque", "⚔️", "ATT"], ["defense", "🛡️", "DEF"], ["soutien", "💚", "SOU"]];
  const htmlCarteJeu = (f, opts = {}) => { const x = forces(f); return `
    <div class="carte-bataille ${opts.cls || ""}" ${opts.id ? `data-carte="${esc(f.id)}"` : ""}>
      <div class="cb-image">${vignette(f, "cb-img")}</div>
      <div class="cb-nom">${esc(f.titre)}</div>
      <div class="cb-stats">${STATS.map(([t, ic, n]) => `<span class="${opts.stat === t ? "choisie" : ""}">${ic} ${n} <b>${x[t]}</b></span>`).join("")}</div>
    </div>`; };
  pages.jeux.cartes = (persos) => {
    if (persos.length < 4) return enTete("🃏", "Bataille de cartes") + `<p class="note">Il faut au moins quatre fiches de personnage pour jouer.</p>`;
    return enTete("🃏", "Bataille de cartes", `Chaque manche : choisis une carte et une caractéristique. L'ordinateur joue une carte, puis chacun lance 1d${DE} + le bonus de la carte. Le plus haut gagne la manche.`) + `
      <section class="panneau" id="cartes-zone"></section>`;
  };
  pages.jeux.cartes.apres = () => {
    const persos = persosJeu();
    const taille = Math.min(5, Math.floor(persos.length / 2));
    let main, ordi, points, manches, carteChoisie, enJeu;
    const nouvelle = () => {
      const m = melanger(persos);
      main = m.slice(0, taille); ordi = m.slice(taille, taille * 2);
      points = { moi: 0, ordi: 0 }; manches = []; carteChoisie = null; enJeu = false;
      dessiner();
    };
    const dessiner = (resultat) => {
      const fin = !main.length;
      const z = $("#cartes-zone");
      z.innerHTML = `
        <div class="score-bataille"><span>Toi <b>${points.moi}</b></span><span class="discret">manche ${Math.min(manches.length + 1, taille)}/${taille}</span><span><b>${points.ordi}</b> Ordinateur</span></div>
        ${resultat || ""}
        ${fin ? (() => {
          const g = points.moi > points.ordi, e = points.moi === points.ordi;
          return `<div class="${g ? "jeu-victoire" : "jeu-defaite"}"><div class="jv-titre">${g ? "🏆 Victoire !" : e ? "⚖️ Égalité" : "💀 Défaite…"}</div><p>${points.moi} manche${points.moi > 1 ? "s" : ""} à ${points.ordi}.</p></div>
            <div class="rangee"><button class="btn btn-or" id="cartes-rejouer">🔄 Nouvelle partie</button></div>`;
        })() : `
        <p class="discret petit-texte">${carteChoisie ? "Choisis la caractéristique à comparer :" : `Ta main (${main.length} carte${main.length > 1 ? "s" : ""}) — touche une carte :`}</p>
        ${carteChoisie ? `<div class="choix-stat">${STATS.map(([t, ic, n]) => `<button class="btn" data-stat="${t}">${ic} ${infoType(t).nom} <b>${forces(carteChoisie)[t]}</b></button>`).join("")}<button class="btn petit" id="cartes-annuler">↩ Autre carte</button></div>` : ""}
        <div class="main-cartes">${main.map((f) => htmlCarteJeu(f, { id: true, cls: carteChoisie && carteChoisie.id === f.id ? "selection" : "" })).join("")}</div>
        <p class="discret petit-texte">L'ordinateur a encore ${ordi.length} carte${ordi.length > 1 ? "s" : ""} cachée${ordi.length > 1 ? "s" : ""}.</p>`}`;
      if (fin) { $("#cartes-rejouer").onclick = nouvelle; return; }
      $$("[data-carte]", z).forEach((c) => (c.onclick = () => { if (enJeu) return; carteChoisie = main.find((f) => f.id === c.dataset.carte); dessiner(resultat); }));
      const an = $("#cartes-annuler"); if (an) an.onclick = () => { carteChoisie = null; dessiner(resultat); };
      $$("[data-stat]", z).forEach((b) => (b.onclick = () => jouer(b.dataset.stat)));
    };
    const jouer = (stat) => {
      if (enJeu || !carteChoisie) return;
      enJeu = true;
      // l'ordinateur : une fois sur deux sa meilleure carte pour cette caractéristique, sinon au hasard
      const tri = [...ordi].sort((a, b) => forces(b)[stat] - forces(a)[stat]);
      const co = alea(2) ? tri[0] : ordi[alea(ordi.length)];
      const moi = carteChoisie;
      let dm, dor, tm, to, relances = 0;
      do { dm = d15(); dor = d15(); tm = dm + forces(moi)[stat]; to = dor + forces(co)[stat]; relances++; } while (tm === to && relances < 5);
      const gagne = tm > to ? "moi" : tm < to ? "ordi" : "egal";
      if (gagne !== "egal") points[gagne]++;
      main = main.filter((f) => f !== moi); ordi = ordi.filter((f) => f !== co);
      manches.push(gagne); carteChoisie = null;
      const [, ic] = STATS.find(([t]) => t === stat);
      const res = `<div class="duel-cartes">
          <div class="${gagne === "moi" ? "gagnante" : ""}">${htmlCarteJeu(moi, { stat })}<div class="dc-jet">🎲 ${dm} ${signe(forces(moi)[stat])} = <b>${tm}</b></div></div>
          <div class="dc-vs">${ic}<br>VS</div>
          <div class="${gagne === "ordi" ? "gagnante" : ""}">${htmlCarteJeu(co, { stat })}<div class="dc-jet">🎲 ${dor} ${signe(forces(co)[stat])} = <b>${to}</b></div></div>
        </div><p class="verdict-manche">${gagne === "moi" ? "✅ Tu gagnes la manche !" : gagne === "ordi" ? "❌ L'ordinateur gagne la manche." : "⚖️ Égalité parfaite."}</p>`;
      if (!main.length && points.moi > points.ordi) sauverScore("cartes", 1, { manches: points });
      setTimeout(() => { enJeu = false; dessiner(res); }, 50);
    };
    nouvelle();
  };

  /* ---------- Grand Tournoi ---------- */
  const CLE_TOURNOI = "aetheria_tournoi";
  function duel(a, b) {
    const fa = forces(a), fb = forces(b), echanges = [];
    let da = 0, db = 0, n = 0;
    while (n < 3 || (da === db && n < 8)) {
      n++;
      const x1 = d15(), y1 = d15(), x2 = d15(), y2 = d15();
      const ta = x1 + fa.attaque, tdb = y1 + fb.defense, tb = x2 + fb.attaque, tda = y2 + fa.defense;
      const coupA = Math.max(0, ta - tdb), coupB = Math.max(0, tb - tda);
      da += coupA; db += coupB;
      echanges.push({ ta, tdb, tb, tda, coupA, coupB, x1, y1, x2, y2 });
    }
    const gagnant = da > db ? a.id : db > da ? b.id : alea(2) ? a.id : b.id;
    return { degatsA: da, degatsB: db, echanges, gagnant, pile: da === db };
  }
  pages.jeux.tournoi = (persos) => {
    if (persos.length < 2) return enTete("🏆", "Grand Tournoi") + `<p class="note">Il faut au moins deux fiches de personnage.</p>`;
    return enTete("🏆", "Grand Tournoi", "Chaque duel se joue en 3 échanges aux vrais dés : chacun attaque, l'autre se défend, on additionne les dégâts. Avant chaque duel, fais ton pronostic !") + `
      <section class="panneau" id="tournoi-zone"></section>`;
  };
  pages.jeux.tournoi.apres = () => {
    const persos = persosJeu();
    let T = lireLS(CLE_TOURNOI, null);
    if (T && !T.tours.flat().every((m) => [m.a, m.b].every((id) => !id || indexParId.has(id)))) T = null;
    const nom = (id) => (indexParId.get(id) || { titre: "?" }).titre;
    const sauver = () => ecrireLS(CLE_TOURNOI, T);
    const z = $("#tournoi-zone");
    const nomsTours = (n) => (n === 1 ? "Finale" : n === 2 ? "Demi-finales" : n === 4 ? "Quarts de finale" : n === 8 ? "Huitièmes de finale" : `Tour à ${n * 2}`);
    const preparer = () => {
      const choisis = new Set(persos.map((f) => f.id));
      const dessinerChoix = () => {
        z.innerHTML = `<h2>Participants</h2>
          <p class="discret petit-texte">Touche un personnage pour le retirer ou le remettre. ${choisis.size} participant${choisis.size > 1 ? "s" : ""}.</p>
          <div class="roue-noms">${persos.map((f) => `<button type="button" class="nom-roue ${choisis.has(f.id) ? "actif" : ""}" data-p="${esc(f.id)}">${choisis.has(f.id) ? "✓ " : ""}${esc(f.titre)}</button>`).join("")}</div>
          <div class="rangee"><button class="btn btn-or" id="t-lancer" ${choisis.size < 2 ? "disabled" : ""}>🏆 Lancer le tournoi</button></div>`;
        $$("[data-p]", z).forEach((b) => (b.onclick = () => { choisis.has(b.dataset.p) ? choisis.delete(b.dataset.p) : choisis.add(b.dataset.p); dessinerChoix(); }));
        $("#t-lancer").onclick = () => {
          const ids = melanger([...choisis]);
          let taille = 1; while (taille < ids.length) taille *= 2;
          const byes = taille - ids.length, premier = [];
          // les premiers ont un « bye » (qualifiés d'office), les autres s'affrontent
          let k = 0;
          for (let i = 0; i < taille / 2; i++) {
            if (i < byes) premier.push({ a: ids[k++], b: null, gagnant: null });
            else premier.push({ a: ids[k++], b: ids[k++], gagnant: null });
          }
          premier.forEach((m) => { if (!m.b) m.gagnant = m.a; });
          T = { tours: [premier], prono: 0, pronoTotal: 0, cree: Date.now() };
          sauver(); dessiner();
        };
      };
      dessinerChoix();
    };
    const avancer = () => {
      const dernier = T.tours[T.tours.length - 1];
      if (dernier.length > 1 && dernier.every((m) => m.gagnant)) {
        const suivant = [];
        for (let i = 0; i < dernier.length; i += 2) suivant.push({ a: dernier[i].gagnant, b: dernier[i + 1].gagnant, gagnant: null });
        T.tours.push(suivant);
      }
    };
    const resumeDuel = (m) => {
      const r = m.duel;
      return r.echanges.map((e, i) => `Échange ${i + 1} : ${nom(m.a)} attaque ${e.ta} contre ${e.tdb} → ${e.coupA} dégât(s) ; ${nom(m.b)} attaque ${e.tb} contre ${e.tda} → ${e.coupB} dégât(s).`).join("\n") +
        `\nTotal : ${nom(m.a)} inflige ${r.degatsA}, ${nom(m.b)} inflige ${r.degatsB}. Vainqueur : ${nom(m.gagnant)}${r.pile ? " (départagé au dernier souffle)" : ""}.`;
    };
    const htmlMatch = (m, ti, mi) => {
      if (!m.b) return `<div class="match bye"><span class="gagne">${esc(nom(m.a))}</span> <small class="discret">qualifié d'office</small></div>`;
      const fini = !!m.gagnant;
      return `<div class="match ${fini ? "fini" : ""}">
        <div class="m-ligne"><span class="${m.gagnant === m.a ? "gagne" : fini ? "perd" : ""}">${esc(nom(m.a))}</span>${fini ? `<b>${m.duel.degatsA}</b>` : ""}</div>
        <div class="m-ligne"><span class="${m.gagnant === m.b ? "gagne" : fini ? "perd" : ""}">${esc(nom(m.b))}</span>${fini ? `<b>${m.duel.degatsB}</b>` : ""}</div>
        ${fini ? `<details><summary>Voir le combat${m.prono ? (m.prono === m.gagnant ? " · ✅ pronostic juste" : " · ❌ pronostic raté") : ""}</summary>
          <ol class="echanges">${m.duel.echanges.map((e) => `<li>⚔️ ${esc(nom(m.a))} ${e.ta} vs 🛡️ ${e.tdb} → <b>${e.coupA}</b> · ⚔️ ${esc(nom(m.b))} ${e.tb} vs 🛡️ ${e.tda} → <b>${e.coupB}</b></li>`).join("")}</ol>
          ${m.recit ? `<div class="contenu ia-texte">${markdown(m.recit)}</div>` : estMembre() ? `<button class="btn petit" data-recit="${ti}-${mi}">🤖 Raconter ce combat</button>` : ""}
          <div data-recit-zone="${ti}-${mi}"></div></details>` : ""}
      </div>`;
    };
    const dessiner = () => {
      if (!T) return preparer();
      avancer(); sauver();
      const dernier = T.tours[T.tours.length - 1];
      const champion = dernier.length === 1 && dernier[0].gagnant;
      const prochain = T.tours.flatMap((t, ti) => t.map((m, mi) => ({ m, ti, mi }))).find(({ m }) => !m.gagnant);
      z.innerHTML = `
        ${champion ? `<div class="jeu-victoire champion"><div class="jv-titre">👑 ${esc(nom(champion))} remporte le Grand Tournoi !</div>${vignette(indexParId.get(champion), "grande")}<p>Pronostics justes : <b>${T.prono}</b> sur ${T.pronoTotal}.</p></div>` : ""}
        ${prochain ? `<div class="prochain-duel">
          <h2>${nomsTours(T.tours[prochain.ti].length)} — prochain duel</h2>
          <div class="duel-cartes">${htmlCarteJeu(indexParId.get(prochain.m.a))}<div class="dc-vs">VS</div>${htmlCarteJeu(indexParId.get(prochain.m.b))}</div>
          <p class="discret petit-texte">Ton pronostic :</p>
          <div class="rangee pronos"><button class="btn ${prochain.m.prono === prochain.m.a ? "btn-or" : ""}" data-prono="${esc(prochain.m.a)}">${esc(nom(prochain.m.a))}</button><button class="btn ${prochain.m.prono === prochain.m.b ? "btn-or" : ""}" data-prono="${esc(prochain.m.b)}">${esc(nom(prochain.m.b))}</button></div>
          <div class="rangee"><button class="btn btn-or large" id="t-combat">⚔️ Lancer le combat</button><button class="btn petit" id="t-tour">⏩ Jouer tout le tour</button></div>
        </div>` : ""}
        ${T.tours.map((t, ti) => `<h3 class="titre-tour">${nomsTours(t.length)}</h3><div class="tableau-tour">${t.map((m, mi) => htmlMatch(m, ti, mi)).join("")}</div>`).reverse().join("")}
        ${champion ? htmlEnvoiDiscord("ed-tournoi") : ""}
        <div class="rangee"><button class="btn petit btn-danger" id="t-nouveau">🔄 Nouveau tournoi</button></div>`;
      $("#t-nouveau").onclick = () => { if (confirm("Recommencer un nouveau tournoi ?")) { T = null; sauver(); preparer(); } };
      if (champion) brancherEnvoiDiscord($("#ed-tournoi"), () => ({ type: "jeu", titre: `🏆 ${nom(champion)} remporte le Grand Tournoi d'Aetheria !`,
        texte: T.tours.map((t) => `**${nomsTours(t.length)}** : ` + t.filter((m) => m.b).map((m) => `${nom(m.gagnant)} bat ${nom(m.gagnant === m.a ? m.b : m.a)} (${Math.max(m.duel.degatsA, m.duel.degatsB)}-${Math.min(m.duel.degatsA, m.duel.degatsB)})`).join(", ")).filter((l) => !/: $/.test(l)).join("\n") }));
      $$("[data-prono]", z).forEach((b) => (b.onclick = () => { prochain.m.prono = b.dataset.prono; sauver(); dessiner(); }));
      const jouerMatch = (m) => {
        m.duel = duel(indexParId.get(m.a), indexParId.get(m.b)); m.gagnant = m.duel.gagnant;
        if (m.prono) { T.pronoTotal++; if (m.prono === m.gagnant) { T.prono++; sauverScore("tournoi", 1, { duel: [m.a, m.b] }); } }
      };
      const bc = $("#t-combat");
      if (bc) bc.onclick = () => { jouerMatch(prochain.m); sauver(); dessiner(); };
      const bt = $("#t-tour");
      if (bt) bt.onclick = () => { T.tours[prochain.ti].filter((m) => !m.gagnant).forEach(jouerMatch); sauver(); dessiner(); };
      $$("[data-recit]", z).forEach((b) => (b.onclick = async () => {
        const [ti, mi] = b.dataset.recit.split("-").map(Number), m = T.tours[ti][mi];
        const zr = $(`[data-recit-zone="${ti}-${mi}"]`, z);
        b.disabled = true;
        const stop = attenteIA(zr, ["L'IA relit les deux fiches…", "Elle suit les jets de dés…", "Elle écrit le combat…"]);
        try {
          const r = await avecDelai(api.ia("question", { question: `Raconte en 8 à 12 lignes, de façon épique et vivante, ce duel du Grand Tournoi d'Aetheria entre ${nom(m.a)} et ${nom(m.b)}. Respecte leurs fiches (pouvoirs, armes, style, personnalité) et suis exactement le déroulé des dés ci-dessous : chaque échange doit correspondre au résultat (un gros écart = un coup qui porte vraiment, 0 dégât = une attaque parée ou esquivée). Termine par la victoire de ${nom(m.gagnant)}. Réponds seulement avec le récit.\n\n${resumeDuel(m)}` }));
          stop(); m.recit = r.texte; sauver(); dessiner();
        } catch (e) { stop(); zr.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message)}</p>`; b.disabled = false; }
      }));
    };
    dessiner();
  };

  /* =====================================================================
     JEU RPG : collection gacha + combats 5 contre 5 au tour par tour
     ===================================================================== */
  const RARETES = {
    commun: { nom: "Commun", ic: "⚪", ordre: 0 },
    rare: { nom: "Rare", ic: "🔵", ordre: 1 },
    epique: { nom: "Épique", ic: "🟣", ordre: 2 },
    legendaire: { nom: "Légendaire", ic: "🟡", ordre: 3 },
  };
  const ROLES_RPG = { defenseur: ["🛡️", "Défenseur"], attaquant: ["⚔️", "Attaquant"], soutien: ["💚", "Soutien"] };
  const TYPES_RPG = { degats: "💥", soin: "💚", bouclier: "🔰", provocation: "😤", etourdir: "💫", renfort: "📯", affaiblir: "🥀" };
  const CIBLES_RPG = { ennemi: "un ennemi", tous_ennemis: "tous les ennemis", allie: "un allié", tous_allies: "toute l'équipe", soi: "lui-même" };
  const MULT = [0, 1, 1.45, 1.9];
  const jourBruxelles = () => new Intl.DateTimeFormat("sv", { timeZone: "Europe/Brussels" }).format(new Date());
  const raretesDe = (rp) => {
    const l = rp.filter((p) => indexParId.has(p.fiche_id)), n = l.length, m = new Map();
    l.forEach((p) => { const k = l.filter((q) => q.puissance >= p.puissance).length; m.set(p.fiche_id, k <= Math.max(1, Math.ceil(n * 0.05)) ? "legendaire" : k <= Math.max(2, Math.ceil(n * 0.2)) ? "epique" : k <= Math.ceil(n * 0.5) ? "rare" : "commun"); });
    return m;
  };
  const etoilesHtml = (n) => `<span class="etoiles">${"★".repeat(n)}<span class="etoiles-vides">${"★".repeat(5 - n)}</span></span>`;
  const descComp = (c) => `${TYPES_RPG[c.type] || ""} ${esc(c.nom)}${c.recharge ? ` <small class="discret">⏳${c.recharge}</small>` : ""}`;
  const texteComp = (c) => `${{ degats: "Dégâts", soin: "Soin", bouclier: "Bouclier", provocation: "Provocation", etourdir: "Étourdit", renfort: "Renfort", affaiblir: "Affaiblit" }[c.type]} ${["", "faible", "moyen", "fort"][c.puissance] || ""} sur ${CIBLES_RPG[c.cible] || c.cible}${c.recharge ? ` · recharge ${c.recharge} tour${c.recharge > 1 ? "s" : ""}` : ""}`;

  function carteRpg(f, info, opts = {}) {
    const rar = RARETES[info.rarete] || RARETES.commun, [ri, rn] = ROLES_RPG[info.role] || ROLES_RPG.attaquant;
    return `<div class="carte-rpg r-${info.rarete || "commun"} ${opts.cls || ""}" ${opts.data || ""}>
      <div class="cr-haut"><span title="${rar.nom}">${rar.ic}</span>${info.etoiles ? etoilesHtml(info.etoiles) : ""}<span title="${rn}">${ri}</span></div>
      <div class="cr-img">${vignette(f, "cb-img")}</div>
      <div class="cr-nomp">${opts.cache ? "???" : esc(f.titre)}</div>
      ${(() => { const x = forces(f); return `<div class="cr-stats"><span>⚔️${x.attaque}</span><span>🛡️${x.defense}</span><span>💚${x.soutien}</span></div>`; })()}
      <div class="cr-rarete">${rar.nom} · ${rn}</div>
      ${opts.badge ? `<div class="cr-badge">${opts.badge}</div>` : ""}
    </div>`;
  }

  /* ---------- Moteur de combat ---------- */
  function creerUnite(f, rp, etoiles, camp, ligne, mult = 1) {
    const x = forces(f), e = (1 + 0.08 * (etoiles - 1)) * mult;
    const pvMax = Math.round((70 + x.defense * 4 + x.soutien * 1.5 + (rp.role === "defenseur" ? 50 : 0)) * e);
    return {
      uid: camp + ":" + f.id, f, nom: f.titre, camp, ligne, role: rp.role, etoiles,
      comp: rp.competences.map((c) => ({ ...c, attente: 0 })),
      pv: pvMax, pvMax, att: x.attaque * e, def: x.defense * e, sou: x.soutien * e,
      bouclier: 0, provoc: 0, etourdi: 0, renfort: 0, faible: 0,
    };
  }
  const vivants = (l) => l.filter((u) => u.pv > 0);
  function ciblesValides(combat, u, c) {
    const amis = u.camp === "moi" ? combat.moi : combat.eux, ennemis = u.camp === "moi" ? combat.eux : combat.moi;
    if (c.cible === "soi") return [u];
    if (c.cible === "allie" || c.cible === "tous_allies") return vivants(amis);
    const v = vivants(ennemis);
    if (c.cible === "tous_ennemis") return v;
    const prov = v.filter((x) => x.provoc > 0);
    if (prov.length) return prov;
    const avant = v.filter((x) => x.ligne === "avant");
    return avant.length ? avant : v;
  }
  function appliquer(combat, u, c, cible) {
    const log = [], evts = [], aoe = c.cible.startsWith("tous");
    const cibles = c.cible === "tous_ennemis" || c.cible === "tous_allies" ? ciblesValides(combat, u, c) : [cible || u];
    const m = MULT[c.puissance] || 1;
    c.attente = c.recharge;
    log.push(`<b class="camp-${u.camp}">${esc(u.nom)}</b> utilise <b>${esc(c.nom)}</b>`);
    cibles.forEach((t) => {
      const d = d15(), crit = d === DE;
      if (["degats", "etourdir", "affaiblir"].includes(c.type)) {
        if (d === 1 && c.type === "degats") { log.push(`🎲1 — ${esc(t.nom)} esquive !`); evts.push({ t, kind: "esquive" }); return; }
        const coef = { degats: 1, etourdir: 0.6, affaiblir: 0.45 }[c.type] * (aoe ? 0.6 : 1);
        let dmg = ((d + u.att) * 1.6 * m * coef + 2) * (u.renfort > 0 ? 1.3 : 1) * (u.faible > 0 ? 0.7 : 1) * (crit ? 1.5 : 1) * combat.fatigue - t.def * 0.35;
        dmg = Math.max(1, Math.round(dmg));
        const absorbe = Math.min(t.bouclier, dmg);
        t.bouclier -= absorbe; t.pv = Math.max(0, t.pv - (dmg - absorbe));
        let txt = `🎲${d}${crit ? " CRITIQUE" : ""} → ${esc(t.nom)} −${dmg - absorbe}${absorbe ? ` (🔰${absorbe} absorbés)` : ""}`;
        if (c.type === "etourdir" && t.pv > 0 && d + c.puissance * 2 >= 11) { t.etourdi = 1; txt += " 💫 étourdi"; }
        if (c.type === "affaiblir" && t.pv > 0) { t.faible = 2; txt += " 🥀 affaibli"; }
        if (t.pv <= 0) txt += ` ☠️ <b>${esc(t.nom)} est K.O.</b>`;
        log.push(txt);
        evts.push({ t, kind: "degats", valeur: dmg - absorbe, absorbe, crit, pv: t.pv, bouclier: t.bouclier, etourdi: t.etourdi > 0 && c.type === "etourdir", faible: c.type === "affaiblir" });
      } else if (c.type === "soin") {
        const soin = Math.round((d * 0.7 + u.sou * 0.9 + 3) * m * (aoe ? 0.5 : 1) * (crit ? 1.5 : 1) / combat.fatigue);
        const avant = t.pv; t.pv = Math.min(t.pvMax, t.pv + soin);
        log.push(`🎲${d} → ${esc(t.nom)} +${t.pv - avant} PV`);
        evts.push({ t, kind: "soin", valeur: t.pv - avant, crit, pv: t.pv });
      } else if (c.type === "bouclier") {
        const b = Math.round((d + u.sou * 0.6 + u.def * 0.6 + 4) * m * (aoe ? 0.6 : 1));
        t.bouclier = Math.min(Math.round(t.pvMax * 0.6), t.bouclier + b);
        log.push(`🎲${d} → 🔰 ${esc(t.nom)} +${b} de bouclier`);
        evts.push({ t, kind: "bouclier", valeur: b, bouclier: t.bouclier });
      } else if (c.type === "provocation") {
        u.provoc = 2;
        const b = Math.round((d + u.def) * 0.5 * m);
        u.bouclier = Math.min(Math.round(u.pvMax * 0.6), u.bouclier + b);
        log.push(`😤 attire tous les coups pendant 2 tours (+🔰${b})`);
        evts.push({ t: u, kind: "provocation", valeur: b, bouclier: u.bouclier });
      } else if (c.type === "renfort") {
        t.renfort = 2;
        log.push(`📯 ${esc(t.nom)} frappe plus fort pendant 2 tours`);
        evts.push({ t, kind: "renfort" });
      }
    });
    log.evts = evts;
    return log;
  }
  function choixIA(combat, u) {
    const prets = u.comp.filter((c) => c.attente <= 0);
    const amis = vivants(u.camp === "moi" ? combat.moi : combat.eux);
    const blesses = amis.filter((a) => a.pv / a.pvMax < 0.55).sort((a, b) => a.pv / a.pvMax - b.pv / b.pvMax);
    const plusFaible = (l) => [...l].sort((a, b) => a.pv - b.pv)[0];
    const trouver = (types) => prets.filter((c) => types.includes(c.type)).sort((a, b) => b.puissance - a.puissance)[0];
    let c;
    if (blesses.length && (c = trouver(["soin"]))) return { c, cible: c.cible === "allie" ? blesses[0] : null };
    if (u.role === "defenseur" && u.provoc <= 0 && amis.some((a) => a !== u && a.pv / a.pvMax < 0.8) && (c = trouver(["provocation"]))) return { c, cible: u };
    if (amis.some((a) => a.pv / a.pvMax < 0.75) && (c = trouver(["bouclier"]))) return { c, cible: c.cible === "allie" ? plusFaible(amis) : u };
    if (!amis.some((a) => a.renfort > 0) && alea(2) && (c = trouver(["renfort"]))) return { c, cible: c.cible === "allie" ? amis.sort((a, b) => b.att - a.att)[0] : u };
    if (alea(2) && (c = trouver(["etourdir", "affaiblir"]))) return { c, cible: plusFaible(ciblesValides(combat, u, c)) };
    c = trouver(["degats"]) || prets.find((x) => !["soin", "bouclier", "renfort", "provocation"].includes(x.type)) || u.comp[0];
    const v = ciblesValides(combat, u, c);
    return { c, cible: c.cible.startsWith("tous") || c.cible === "soi" ? null : (["soin", "bouclier", "renfort"].includes(c.type) ? plusFaible(v) : plusFaible(v)) };
  }

  /* ---------- Page ---------- */
  /* ---------- Scène de combat animée (canvas 2D) ---------- */
  const ELEMENTS = {
    sang: { c1: "#c0102a", c2: "#5a0010", glow: "#ff2a4a", nom: "sang" },
    feu: { c1: "#ffb020", c2: "#ff4a00", glow: "#ff8a1a", nom: "feu" },
    glace: { c1: "#c8f0ff", c2: "#5ab8f0", glow: "#9ee6ff", nom: "glace" },
    foudre: { c1: "#fff7a0", c2: "#b48cff", glow: "#e8e0ff", nom: "foudre" },
    lumiere: { c1: "#fff6d0", c2: "#f5c542", glow: "#ffe58a", nom: "lumière" },
    ombre: { c1: "#7a3cff", c2: "#1a0830", glow: "#9a5cff", nom: "ombre" },
    nature: { c1: "#7fe07a", c2: "#2e7d32", glow: "#a8ff9a", nom: "nature" },
    poison: { c1: "#b4f03c", c2: "#4a7a10", glow: "#c8ff50", nom: "poison" },
    eau: { c1: "#7ad0ff", c2: "#1a6ad0", glow: "#9adcff", nom: "eau" },
    vent: { c1: "#f0fff8", c2: "#9ad8c8", glow: "#ffffff", nom: "vent" },
    terre: { c1: "#c89a5a", c2: "#6a4a2a", glow: "#e0b070", nom: "terre" },
    arcane: { c1: "#ff7af0", c2: "#7a2ad0", glow: "#ff9af5", nom: "arcane" },
    physique: { c1: "#ffffff", c2: "#b8c0d8", glow: "#ffffff", nom: "physique" },
  };
  // mots cherchés au DÉBUT d'un mot (« sceau » ne doit pas compter comme « eau », ni « flamme » comme « âme »)
  const motsDebut = (l) => new RegExp("\\b(?:" + l.join("|") + ")");
  const MOTS_ELEMENTS = [
    ["arcane", motsDebut(["mots?\\b", "parole", "verbe", "ecritur", "sceau", "sceaux", "scell", "arcan", "rune", "runiq", "mana", "astral", "etoil", "cosm", "sortileg", "magie pure", "ether", "illusion", "carte", "psych", "glyphe", "portail", "dimension"])],
    ["sang", motsDebut(["sang", "hemo", "vampir", "morsure", "saign", "ecarlate", "pourpre"])],
    ["feu", motsDebut(["feu", "feux", "flamm", "brul", "braise", "incend", "ignis", "pyro", "magma", "lave", "solaire", "soleil", "cendre", "brasier", "fournaise"])],
    ["glace", motsDebut(["glac", "gel", "givr", "neige", "frimas", "cryo", "froid", "blizzard"])],
    ["foudre", motsDebut(["foudr", "eclair", "tonnerr", "electr", "orage", "fulgur"])],
    ["lumiere", motsDebut(["lumi", "sacre", "divin", "celest", "benedic", "aura", "radian", "saint", "halo", "clarte"])],
    ["ombre", motsDebut(["ombre", "tenebr", "nuit", "abyss", "neant", "obscur", "spectr", "ames?\\b", "maudi", "malefi", "demon"])],
    ["poison", motsDebut(["poison", "venin", "toxi", "acide", "miasme"])],
    ["nature", motsDebut(["natur", "liane", "ronce", "vegetal", "fleur", "plante", "feuill", "racine", "foret", "sylv", "epine"])],
    ["eau", motsDebut(["eau\\b", "eaux\\b", "vague", "maree", "ocean", "mer\\b", "mers\\b", "aqua", "aquat", "torrent", "pluie", "sirene", "ecume", "hydro"])],
    ["vent", motsDebut(["vent", "tornade", "tempete", "souffl", "ouragan", "bourrasque", "air\\b", "plume", "aile"])],
    ["terre", motsDebut(["terre", "roche", "rocher", "pierre", "seism", "sol\\b", "montagne", "sable", "gravat"])],
  ];
  const ELEMENT_RACE = [[/vampir/, "sang"], [/demon|oni/, "feu"], [/archange|ange|celest/, "lumiere"], [/sirene/, "eau"], [/elfe noir|dechu/, "ombre"], [/elfe/, "nature"], [/dieu/, "arcane"]];
  function elementDe(c, u) {
    if (c.element && ELEMENTS[c.element]) return c.element;
    const t = normal(`${c.nom} ${c.description || ""}`);
    for (const [e, re] of MOTS_ELEMENTS) if (re.test(t)) return e;
    if (c.type === "soin") return "lumiere";
    if (c.type === "bouclier") return "arcane";
    if (c.type === "provocation" || c.type === "renfort") return "physique";
    const race = normal(infoPerso(u.f, /race|peuple|espece/));
    if (c !== u.comp[0]) for (const [re, e] of ELEMENT_RACE) if (re.test(race)) return e;
    return "physique";
  }
  const auCorpsACorps = (c, u, el) => c.portee ? c.portee === "melee" : (el === "physique" || u.role === "defenseur" || (c === u.comp[0] && u.role !== "soutien" && ["physique", "sang", "terre"].includes(el)));
  const imagesScene = new Map();
  const imageDe = (f) => {
    if (!urlSure(f.image_url)) return null;
    if (!imagesScene.has(f.id)) { const im = new Image(); im.src = f.image_url; imagesScene.set(f.id, im); }
    const im = imagesScene.get(f.id);
    return im.complete && im.naturalWidth ? im : null;
  };
  /* Figurine = l'image de la fiche, détourée si le fond est uni, sinon fondue sur les bords */
  const figurines = new Map();
  function preparerFigurine(img, detourable) {
    const H0 = 260, k = Math.min(1, H0 / img.naturalHeight, 260 / img.naturalWidth) || 1;
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, w, h);
    let ok = false, x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
    if (detourable) {
      try {
        const id = cx.getImageData(0, 0, w, h), d = id.data;
        const px = (x, y) => (y * w + x) * 4;
        const coins = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].map(([x, y]) => [d[px(x, y)], d[px(x, y) + 1], d[px(x, y) + 2], d[px(x, y) + 3]]);
        const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        const deja = coins[0][3] < 20 && coins.every((c) => c[3] < 20);
        if (deja) ok = true; // image déjà transparente (PNG détouré)
        else {
          // couleur de fond : celle des coins (s'ils se ressemblent au moins à 3)
          const fond = coins.find((c) => coins.filter((o) => dist(o, c) < 60).length >= 3);
          if (fond) {
            const vu = new Uint8Array(w * h), pile = [], TOL = 70;
            for (let x = 0; x < w; x++) pile.push(x, 0, x, h - 1);
            for (let y = 0; y < h; y++) pile.push(0, y, w - 1, y);
            let enleves = 0;
            while (pile.length) {
              const y = pile.pop(), x = pile.pop(), i = y * w + x;
              if (x < 0 || y < 0 || x >= w || y >= h || vu[i]) continue;
              const p = i * 4;
              if (Math.abs(d[p] - fond[0]) + Math.abs(d[p + 1] - fond[1]) + Math.abs(d[p + 2] - fond[2]) > TOL) continue;
              vu[i] = 1; d[p + 3] = 0; enleves++;
              pile.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
            }
            const part = enleves / (w * h);
            if (part > 0.08 && part < 0.88) {
              // adoucir le bord du personnage
              for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                if (!vu[i] && (vu[i - 1] || vu[i + 1] || vu[i - w] || vu[i + w])) d[i * 4 + 3] = 150;
              }
              cx.putImageData(id, 0, 0); ok = true;
            }
          }
        }
        if (ok) {
          // recadrer sur le personnage
          const id2 = cx.getImageData(0, 0, w, h).data; x0 = w; y0 = h; x1 = 0; y1 = 0;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (id2[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          if (x1 <= x0 || y1 <= y0) { ok = false; x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; cx.clearRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h); }
        }
      } catch (e) { ok = false; }
    }
    if (!ok) {
      // fond impossible à enlever (décor) : l'image entière dans une arche, comme un vitrail, qui se fond en bas
      cx.globalCompositeOperation = "destination-in";
      cx.beginPath(); const r = w / 2; cx.moveTo(0, h); cx.lineTo(0, r); cx.arc(w / 2, r, r, Math.PI, 0); cx.lineTo(w, h); cx.closePath();
      cx.fillStyle = "#000"; cx.fill();
      // (destination-in efface tout ce qui est hors du dessin : le dégradé couvre donc toute l'image)
      const g2 = cx.createLinearGradient(0, 0, 0, h); g2.addColorStop(0, "rgba(0,0,0,1)"); g2.addColorStop(0.8, "rgba(0,0,0,1)"); g2.addColorStop(1, "rgba(0,0,0,0)");
      cx.fillStyle = g2; cx.fillRect(0, 0, w, h);
      cx.globalCompositeOperation = "source-over";
      cx.strokeStyle = "rgba(227,184,102,0.9)"; cx.lineWidth = Math.max(2, w / 60);
      cx.beginPath(); cx.moveTo(1, h * 0.85); cx.lineTo(1, r); cx.arc(w / 2, r, r - 1, Math.PI, 0); cx.lineTo(w - 1, h * 0.85); cx.stroke();
    }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const sprite = document.createElement("canvas"); sprite.width = cw; sprite.height = ch;
    sprite.getContext("2d").drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
    const blanc = document.createElement("canvas"); blanc.width = cw; blanc.height = ch;
    const bx = blanc.getContext("2d"); bx.drawImage(sprite, 0, 0); bx.globalCompositeOperation = "source-in"; bx.fillStyle = "#fff"; bx.fillRect(0, 0, cw, ch);
    return { sprite, blanc, detoure: ok };
  }
  function figurineDe(f) {
    if (!urlSure(f.image_url)) return null;
    let e = figurines.get(f.id);
    if (!e) {
      e = { pret: null };
      figurines.set(f.id, e);
      const charger = (cors) => {
        const im = new Image();
        if (cors && !/^data:/i.test(f.image_url)) im.crossOrigin = "anonymous";
        im.onload = () => { try { e.pret = preparerFigurine(im, true); } catch (x) { e.pret = preparerFigurine(im, false); } };
        im.onerror = () => { if (cors) charger(false); else e.pret = false; };
        im.src = f.image_url;
      };
      charger(true);
    }
    return e.pret || null;
  }
  const COULEUR_ROLE = { defenseur: ["#5a6a8a", "#2a3450"], attaquant: ["#8a3a3a", "#401a22"], soutien: ["#3a7a5a", "#173a2a"] };

  function creerScene(canvas, combat, surTap) {
    const W = 360, H = 480, ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const parts = [], textes = [], projectiles = [], eclairs = [], anneaux = [];
    let secousse = 0, flash = 0, banniere = null, ciblables = new Set(), actif = null, vivante = true, t0 = performance.now(), dernier = t0;
    const etat = new Map();
    const places = (l, camp) => {
      const avant = l.filter((u) => u.ligne === "avant"), arriere = l.filter((u) => u.ligne === "arriere");
      const pose = (r, y, s) => r.forEach((u, i) => { const n = r.length, x = W / 2 + (i - (n - 1) / 2) * (n > 2 ? 104 : 120); etat.set(u.uid, { x, y, s, bx: x, by: y, ox: 0, oy: 0, pv: u.pv, bouclier: u.bouclier, blanc: 0, ko: u.pv <= 0 ? 1 : 0, phase: Math.random() * 6 }); });
      if (camp === "eux") { pose(arriere, 122, 0.72); pose(avant, 206, 0.84); }
      else { pose(avant, 346, 0.96); pose(arriere, 446, 1.03); }
    };
    places(combat.eux, "eux"); places(combat.moi, "moi");
    const tous = () => [...combat.eux, ...combat.moi];
    const E = (u) => etat.get(u.uid);
    const centre = (u) => { const e = E(u); return { x: e.x + e.ox, y: e.y + e.oy - (e.h || 100 * e.s) * 0.5 }; };

    // ---- particules ----
    const ajouter = (p) => { if (parts.length < 500) parts.push({ vx: 0, vy: 0, g: 0, taille: 3, vie: 0.6, age: 0, add: true, forme: "rond", rot: Math.random() * 6, vr: 0, ...p }); };
    const rnd = (a, b) => a + Math.random() * (b - a);
    function eclat(x, y, el, force = 1) {
      const E2 = ELEMENTS[el] || ELEMENTS.physique, n = Math.round(22 * force);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2), v = rnd(40, 170) * force;
        const p = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, couleur: Math.random() < 0.5 ? E2.c1 : E2.c2, taille: rnd(2, 5) * force, vie: rnd(0.35, 0.8) };
        if (el === "sang") Object.assign(p, { g: 420, add: false, forme: "goutte", vy: p.vy - 60 });
        else if (el === "feu") Object.assign(p, { g: -160, forme: "rond", taille: rnd(3, 7) });
        else if (el === "glace") Object.assign(p, { forme: "eclat", vr: rnd(-8, 8), add: false, taille: rnd(3, 7) });
        else if (el === "nature" || el === "poison") Object.assign(p, { forme: el === "nature" ? "feuille" : "bulle", g: el === "nature" ? 60 : -50, vr: rnd(-6, 6) });
        else if (el === "ombre") Object.assign(p, { forme: "fumee", add: false, taille: rnd(8, 16), vx: p.vx * 0.4, vy: p.vy * 0.4 - 20, vie: rnd(0.6, 1.1) });
        else if (el === "terre") Object.assign(p, { forme: "roche", g: 380, add: false, vr: rnd(-6, 6) });
        else if (el === "eau") Object.assign(p, { forme: "goutte", g: 300, vy: p.vy - 80 });
        else if (el === "arcane") Object.assign(p, { forme: "etoile", vr: rnd(-5, 5) });
        else if (el === "lumiere") Object.assign(p, { forme: "etoile", vx: p.vx * 0.6, vy: p.vy * 0.6 - 30 });
        else if (el === "vent") Object.assign(p, { forme: "trait", vie: 0.4 });
        else if (el === "foudre") Object.assign(p, { forme: "trait", vie: 0.25, taille: rnd(2, 4) });
        else Object.assign(p, { forme: "trait", vie: 0.3 });
        ajouter(p);
      }
      anneaux.push({ x, y, r: 6, rmax: 46 * force, vie: 0.35, age: 0, couleur: E2.glow });
    }
    function trainee(x, y, el) {
      const E2 = ELEMENTS[el] || ELEMENTS.physique;
      const n = el === "physique" ? 1 : 3;
      for (let i = 0; i < n; i++) {
        const p = { x: x + rnd(-4, 4), y: y + rnd(-4, 4), vx: rnd(-20, 20), vy: rnd(-20, 20), couleur: Math.random() < 0.6 ? E2.c1 : E2.c2, taille: rnd(2, 5), vie: rnd(0.25, 0.5) };
        if (el === "sang") Object.assign(p, { g: 260, add: false, forme: "goutte" });
        if (el === "feu") Object.assign(p, { g: -120, taille: rnd(3, 7) });
        if (el === "ombre") Object.assign(p, { forme: "fumee", add: false, taille: rnd(6, 12) });
        if (el === "glace") Object.assign(p, { forme: "eclat", add: false, vr: rnd(-6, 6) });
        if (el === "nature") Object.assign(p, { forme: "feuille", vr: rnd(-6, 6) });
        if (el === "arcane" || el === "lumiere") Object.assign(p, { forme: "etoile" });
        ajouter(p);
      }
    }
    function nombre(x, y, txt, couleur, gros = false) { textes.push({ x: x + rnd(-8, 8), y, txt, couleur, gros, vie: 1.1, age: 0 }); }

    // ---- outils d'animation ----
    const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms / (combat.vitesse || 1)));
    const tween = (ms, f) => new Promise((ok) => {
      const d = ms / (combat.vitesse || 1), debut = performance.now();
      const pas = () => { const k = Math.min(1, (performance.now() - debut) / d); f(k); if (k < 1 && vivante) requestAnimationFrame(pas); else ok(); };
      requestAnimationFrame(pas);
    });
    const doux = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    function projectile(de, vers, el, ms = 460, gros = 1) {
      return new Promise((ok) => {
        const a = { x: de.x, y: de.y }, b = { x: vers.x, y: vers.y }, h = Math.min(80, Math.hypot(b.x - a.x, b.y - a.y) * 0.25);
        projectiles.push({ a, b, h, el, debut: performance.now(), d: ms / (combat.vitesse || 1), gros, fin: ok });
      });
    }
    function foudre(de, vers) {
      const pts = [], n = 9;
      for (let i = 0; i <= n; i++) { const k = i / n; pts.push({ x: de.x + (vers.x - de.x) * k + (i && i < n ? rnd(-18, 18) : 0), y: de.y + (vers.y - de.y) * k + (i && i < n ? rnd(-10, 10) : 0) }); }
      eclairs.push({ pts, vie: 0.28, age: 0 }); flash = Math.max(flash, 0.35);
    }

    // ---- impact d'un évènement ----
    function impact(ev, el) {
      const e = E(ev.t), p = centre(ev.t);
      if (ev.kind === "degats") {
        eclat(p.x, p.y, el, ev.crit ? 1.5 : 1);
        e.blanc = 1; e.pv = ev.pv; e.bouclier = ev.bouclier;
        const dir = ev.t.camp === "eux" ? -1 : 1;
        tween(260, (k) => { e.oy = Math.sin(k * Math.PI) * 10 * dir; e.ox = Math.sin(k * Math.PI * 4) * 4 * (1 - k); });
        nombre(p.x, p.y - 20, (ev.crit ? "💥 " : "") + "-" + ev.valeur, ev.crit ? "#ffd84a" : "#ff6a6a", ev.crit);
        if (ev.absorbe) nombre(p.x + 26, p.y, "🔰" + ev.absorbe, "#9adcff");
        if (ev.crit) { secousse = 10; flash = Math.max(flash, 0.25); }
        else secousse = Math.max(secousse, 3);
        if (ev.etourdi) nombre(p.x, p.y - 44, "💫 étourdi", "#fff2a0");
        if (ev.faible) nombre(p.x, p.y - 44, "🥀 affaibli", "#c89aff");
      } else if (ev.kind === "esquive") {
        tween(300, (k) => { e.ox = Math.sin(k * Math.PI) * 24; });
        nombre(p.x, p.y - 20, "Esquive !", "#ffffff");
      } else if (ev.kind === "soin") {
        e.pv = ev.pv;
        for (let i = 0; i < 18; i++) ajouter({ x: p.x + rnd(-22, 22), y: p.y + rnd(0, 40), vy: rnd(-90, -40), couleur: i % 2 ? "#a8ff9a" : "#fff6d0", forme: i % 3 ? "etoile" : "croix", taille: rnd(3, 6), vie: rnd(0.6, 1) });
        nombre(p.x, p.y - 20, "+" + ev.valeur, "#7fff9a", ev.crit);
      } else if (ev.kind === "bouclier" || ev.kind === "provocation") {
        e.bouclier = ev.bouclier;
        anneaux.push({ x: p.x, y: p.y + 6, r: 10, rmax: 40 * e.s, vie: 0.5, age: 0, couleur: "#9adcff", plein: true });
        nombre(p.x, p.y - 20, "🔰+" + ev.valeur, "#9adcff");
        if (ev.kind === "provocation") for (let i = 0; i < 3; i++) setTimeout(() => anneaux.push({ x: p.x, y: p.y, r: 10, rmax: 90, vie: 0.5, age: 0, couleur: "#ff5a4a" }), i * 140);
      } else if (ev.kind === "renfort") {
        for (let i = 0; i < 14; i++) ajouter({ x: p.x + rnd(-20, 20), y: p.y + rnd(0, 40), vy: rnd(-120, -60), couleur: "#ffd84a", forme: "fleche", taille: rnd(4, 7), vie: rnd(0.5, 0.9) });
        nombre(p.x, p.y - 20, "📯 renfort", "#ffd84a");
      }
    }

    // ---- jouer une action complète ----
    async function jouer(u, c, cibles, evts) {
      const el = elementDe(c, u), E2 = ELEMENTS[el], e = E(u), off = ["degats", "etourdir", "affaiblir"].includes(c.type), aoe = c.cible.startsWith("tous");
      actif = u; banniere = { txt: c.nom, sous: `${u.nom}${el !== "physique" ? " · " + E2.nom : ""}`, couleur: E2.glow, vie: 1.4, age: 0 };
      // prise d'élan
      await tween(180, (k) => { e.oy = -8 * Math.sin(k * Math.PI / 2); });
      for (let i = 0; i < 10; i++) ajouter({ x: centre(u).x + rnd(-18, 18), y: centre(u).y + rnd(-10, 40), vy: rnd(-60, -20), couleur: E2.c1, taille: rnd(2, 4), vie: 0.5, forme: el === "sang" ? "goutte" : "rond" });
      const parCible = (t) => evts.filter((ev) => ev.t === t);
      if (off) {
        const vises = aoe ? cibles : cibles.slice(0, 1);
        if (!aoe && auCorpsACorps(c, u, el)) {
          const t = vises[0], pt = centre(t), dep = { x: e.ox, y: e.oy }, ex = E(t);
          const dx = (ex.x - e.x) * 0.78, dy = (ex.y - e.y) * 0.78 + (t.camp === "eux" ? 30 : -30);
          await tween(220, (k) => { const q = doux(k); e.ox = dep.x + dx * q; e.oy = dep.y + dy * q; });
          // entaille
          const ang = rnd(-0.6, 0.6);
          for (let i = 0; i < 16; i++) { const k = i / 15, a = ang - 0.9 + k * 1.8; ajouter({ x: pt.x + Math.cos(a) * 30, y: pt.y + Math.sin(a) * 18, vx: Math.cos(a + 1.57) * 30, vy: Math.sin(a + 1.57) * 30, couleur: E2.c1, forme: "trait", taille: 3, vie: 0.3, rot: a + 1.57 }); }
          parCible(t).forEach((ev) => impact(ev, el));
          await attendre(160);
          await tween(220, (k) => { const q = doux(k); e.ox = dep.x + dx * (1 - q); e.oy = dep.y + dy * (1 - q); });
        } else if (el === "foudre") {
          vises.forEach((t) => foudre({ x: centre(u).x, y: centre(u).y - 10 }, centre(t)));
          await attendre(90);
          vises.forEach((t) => parCible(t).forEach((ev) => impact(ev, el)));
          await attendre(150);
          vises.forEach((t) => foudre({ x: centre(u).x, y: centre(u).y - 10 }, centre(t)));
          await attendre(200);
        } else {
          await Promise.all(vises.map((t, i) => attendre(i * 70).then(() => projectile({ x: centre(u).x, y: centre(u).y - 6 }, centre(t), el, aoe ? 520 : 460, c.puissance >= 3 ? 1.5 : 1)).then(() => parCible(t).forEach((ev) => impact(ev, el)))));
          await attendre(180);
        }
      } else if (c.type === "provocation") {
        evts.forEach((ev) => impact(ev, el));
        await tween(300, (k) => { e.oy = -14 * Math.sin(k * Math.PI); });
      } else {
        const aides = aoe ? cibles : cibles.slice(0, 1);
        await Promise.all(aides.map((t, i) => t === u ? Promise.resolve().then(() => parCible(t).forEach((ev) => impact(ev, el))) :
          attendre(i * 60).then(() => projectile({ x: centre(u).x, y: centre(u).y - 6 }, centre(t), el, 420, 0.8)).then(() => parCible(t).forEach((ev) => impact(ev, el)))));
        await attendre(200);
      }
      await tween(160, (k) => { e.oy = e.oy * (1 - k); });
      e.ox = 0; e.oy = 0;
      tous().forEach((x) => { const s = E(x); s.pv = x.pv; s.bouclier = x.bouclier; });
      actif = null;
      await attendre(120);
    }
    async function etourdi(u) {
      const p = centre(u);
      for (let i = 0; i < 6; i++) ajouter({ x: p.x + Math.cos(i) * 20, y: p.y - 30, vx: Math.cos(i * 1.05) * 30, vy: -10, couleur: "#fff2a0", forme: "etoile", taille: 5, vie: 0.8, add: true });
      nombre(p.x, p.y - 30, "💫 passe son tour", "#fff2a0");
      await attendre(650);
    }

    // ---- dessin ----
    const fond = (t) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#151233"); g.addColorStop(0.45, "#241a40"); g.addColorStop(0.5, "#2a2148"); g.addColorStop(1, "#0f1a22");
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
      // sol en perspective
      ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = "#e3b866"; ctx.lineWidth = 1;
      for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 22, 70); ctx.lineTo(W / 2 + i * 70, H); ctx.stroke(); }
      for (let k = 0; k < 9; k++) { const y = 70 + Math.pow(k / 8, 1.6) * (H - 70); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();
      // cercle d'arène
      ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(t * 1.5) * 0.05; ctx.strokeStyle = "#e3b866"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(W / 2, 258, 150, 40, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.ellipse(W / 2, 258, 110, 28, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      // poussières
      ctx.save();
      for (let i = 0; i < 26; i++) { const x = (i * 97 + t * 8 * ((i % 3) + 1)) % W, y = (i * 53 + Math.sin(t + i) * 10) % H; ctx.globalAlpha = 0.15 + (i % 4) * 0.05; ctx.fillStyle = "#f5d08a"; ctx.fillRect(x, y, 1.6, 1.6); }
      ctx.restore();
    };
    function figurine(u, t, fig) {
      const e = E(u), s = e.s;
      if (u.pv <= 0 && e.pv <= 0) e.ko = Math.min(1, e.ko + 0.03);
      const resp = Math.sin(t * 2.2 + e.phase) * (1 - e.ko);
      const x = e.x + e.ox, y = e.y + e.oy;
      const sp = fig.sprite, ratio = sp.width / sp.height;
      let hh = 120 * s, ww = hh * ratio;
      if (ww > 96 * s) { ww = 96 * s; hh = ww / ratio; }
      e.h = hh;
      const camp = u.camp === "moi" ? "127,209,160" : "224,112,112";
      ctx.save();
      // socle magique
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.ellipse(x, e.y, 30 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
      const gs = ctx.createRadialGradient(x, e.y, 2, x, e.y, 34 * s); gs.addColorStop(0, `rgba(${camp},0.45)`); gs.addColorStop(1, `rgba(${camp},0)`);
      ctx.fillStyle = gs; ctx.beginPath(); ctx.ellipse(x, e.y, 34 * s, 11 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${camp},0.85)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, e.y, 30 * s, 9 * s, 0, 0, Math.PI * 2); ctx.stroke();
      if (ciblables.has(u.uid)) { ctx.strokeStyle = `rgba(127,200,248,${0.6 + Math.sin(t * 8) * 0.4})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, e.y, 38 * s, 13 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (actif === u || (combat.attente && combat.attente.u === u)) { ctx.strokeStyle = `rgba(245,208,138,${0.7 + Math.sin(t * 6) * 0.3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, e.y, 35 * s, 12 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (u.provoc > 0) { ctx.strokeStyle = `rgba(255,90,74,${0.4 + Math.sin(t * 5) * 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, e.y, 42 * s, 14 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
      // le personnage (respiration + chute au K.O.)
      ctx.translate(x, y);
      if (e.ko) { ctx.rotate(e.ko * (u.camp === "moi" ? 1.25 : -1.25)); ctx.globalAlpha = 1 - e.ko * 0.6; }
      const sx = 1 + resp * 0.012, sy = 1 - resp * 0.012 + resp * 0.02;
      ctx.scale(sx, sy);
      ctx.shadowColor = `rgba(${camp},0.9)`; ctx.shadowBlur = fig.detoure ? 8 : 14;
      if (e.ko) ctx.filter = `grayscale(${e.ko})`;
      ctx.drawImage(sp, -ww / 2, -hh, ww, hh);
      ctx.shadowBlur = 0; ctx.filter = "none";
      if (e.blanc > 0) { ctx.globalAlpha = e.blanc * 0.85; ctx.drawImage(fig.blanc, -ww / 2, -hh, ww, hh); ctx.globalAlpha = 1; e.blanc = Math.max(0, e.blanc - 0.08); }
      if (e.bouclier > 0) { ctx.strokeStyle = `rgba(154,220,255,${0.45 + Math.sin(t * 4) * 0.2})`; ctx.fillStyle = "rgba(154,220,255,0.08)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -hh / 2, ww / 2 + 10, hh / 2 + 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      if (u.etourdi > 0) for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; ctx.fillStyle = "#fff2a0"; ctx.font = "12px sans-serif"; ctx.fillText("★", Math.cos(a) * 20 - 5, -hh - 4 + Math.sin(a) * 5); }
      if (u.renfort > 0) { ctx.fillStyle = `rgba(255,216,74,${0.5 + Math.sin(t * 5) * 0.3})`; ctx.font = "13px sans-serif"; ctx.fillText("▲", ww / 2 - 4, -hh + 14); }
      if (u.faible > 0) { ctx.fillStyle = "rgba(200,154,255,0.85)"; ctx.font = "13px sans-serif"; ctx.fillText("▼", -ww / 2 - 6, -hh + 14); }
      ctx.restore();
      barreVie(u, x, y - hh - 8, s);
    }
    function barreVie(u, x, by, s) {
      const e = E(u), bw = 54 * s;
      ctx.save();
      ctx.globalAlpha = 1 - e.ko * 0.6;
      ctx.font = `600 ${Math.round(10 * s + 1)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = "#f2ecdc";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 3; ctx.fillText(u.nom.length > 12 ? u.nom.slice(0, 11) + "…" : u.nom, x, by - 4); ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x - bw / 2, by, bw, 5);
      if (e.pvAff === undefined) e.pvAff = e.pv;
      e.pvAff += (e.pv - e.pvAff) * 0.12;
      const k1 = Math.max(0, e.pvAff / u.pvMax), k2 = Math.max(0, e.pv / u.pvMax);
      ctx.fillStyle = "#ffef9a"; ctx.fillRect(x - bw / 2, by, bw * k1, 5);
      ctx.fillStyle = k2 < 0.3 ? "#e05050" : u.camp === "moi" ? "#5fd18a" : "#e07a5a"; ctx.fillRect(x - bw / 2, by, bw * k2, 5);
      if (e.bouclier > 0) { ctx.fillStyle = "rgba(154,220,255,0.85)"; ctx.fillRect(x - bw / 2, by + 5, bw * Math.min(1, e.bouclier / u.pvMax), 2); }
      ctx.restore();
    }
    function personnage(u, t) {
      const fig = figurineDe(u.f);
      if (fig) return figurine(u, t, fig);
      const e = E(u), s = e.s, haut = u.camp === "moi";
      e.h = 100 * s;
      if (u.pv <= 0 && e.pv <= 0) e.ko = Math.min(1, e.ko + 0.03);
      const resp = Math.sin(t * 2.2 + e.phase) * 1.6 * (1 - e.ko);
      const x = e.x + e.ox, y = e.y + e.oy;
      const [c1, c2] = COULEUR_ROLE[u.role] || COULEUR_ROLE.attaquant;
      ctx.save();
      ctx.globalAlpha = 1 - e.ko * 0.65;
      // ombre + socle
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.beginPath(); ctx.ellipse(x, e.y, 26 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = u.camp === "moi" ? "rgba(127,209,160,0.75)" : "rgba(224,112,112,0.75)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, e.y, 28 * s, 9 * s, 0, 0, Math.PI * 2); ctx.stroke();
      if (ciblables.has(u.uid)) { ctx.strokeStyle = `rgba(127,200,248,${0.6 + Math.sin(t * 8) * 0.4})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, e.y, 34 * s, 12 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (actif === u || (combat.attente && combat.attente.u === u)) { ctx.strokeStyle = `rgba(245,208,138,${0.7 + Math.sin(t * 6) * 0.3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, e.y, 32 * s, 11 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (u.provoc > 0) { ctx.strokeStyle = `rgba(255,90,74,${0.4 + Math.sin(t * 5) * 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, e.y, 38 * s, 13 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.translate(x, y + resp * 0.3);
      if (e.ko) ctx.rotate(e.ko * (u.camp === "moi" ? 1.2 : -1.2));
      ctx.scale(s, s);
      // jambes
      ctx.fillStyle = "#14121f";
      ctx.fillRect(-9, -18, 7, 18); ctx.fillRect(2, -18, 7, 18);
      // cape / corps
      const g = ctx.createLinearGradient(0, -62, 0, -10); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-14, -60 + resp); ctx.quadraticCurveTo(-24, -30, -20, -12); ctx.lineTo(20, -12); ctx.quadraticCurveTo(24, -30, 14, -60 + resp); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
      // ceinture dorée
      ctx.fillStyle = "#e3b866"; ctx.fillRect(-15, -34, 30, 3);
      // arme selon le rôle
      ctx.save(); const cote = haut ? 1 : -1; ctx.translate(20 * cote, -36 + resp);
      if (u.role === "defenseur") { ctx.fillStyle = "#8a96b8"; ctx.strokeStyle = "#e3b866"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(9, -12); ctx.lineTo(9, 4); ctx.quadraticCurveTo(0, 16, -9, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if (u.role === "attaquant") { ctx.rotate(-0.5 * cote); ctx.fillStyle = "#dfe6f5"; ctx.fillRect(-1.5, -34, 3, 30); ctx.fillStyle = "#e3b866"; ctx.fillRect(-6, -5, 12, 3); ctx.fillStyle = "#4a2a1a"; ctx.fillRect(-1.5, -2, 3, 8); }
      else { ctx.fillStyle = "#7a5a3a"; ctx.fillRect(-1.5, -40, 3, 50); const gl = 0.6 + Math.sin(t * 3) * 0.3; ctx.fillStyle = `rgba(168,255,154,${gl})`; ctx.beginPath(); ctx.arc(0, -42, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      // tête = portrait
      const ry = -78 + resp, r = 19;
      ctx.save(); ctx.beginPath(); ctx.arc(0, ry, r, 0, Math.PI * 2); ctx.closePath();
      const im = imageDe(u.f);
      if (im) { ctx.clip(); const k = Math.max((r * 2) / im.naturalWidth, (r * 2) / im.naturalHeight); ctx.drawImage(im, -im.naturalWidth * k / 2, ry - im.naturalHeight * k / 2 - r * 0.15, im.naturalWidth * k, im.naturalHeight * k); }
      else { ctx.fillStyle = "#2a2f55"; ctx.fill(); ctx.fillStyle = "#e3b866"; ctx.font = "bold 16px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((u.nom || "?").slice(0, 1), 0, ry + 1); }
      ctx.restore();
      ctx.strokeStyle = u.camp === "moi" ? "#7fd1a0" : "#e07070"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, ry, r, 0, Math.PI * 2); ctx.stroke();
      // flash blanc quand touché
      if (e.blanc > 0) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(255,255,255,${e.blanc * 0.7})`; ctx.beginPath(); ctx.arc(0, ry, r + 2, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-20, -62, 40, 50); ctx.globalCompositeOperation = "source-over"; e.blanc = Math.max(0, e.blanc - 0.08); }
      // bulle de bouclier
      if (e.bouclier > 0) { ctx.strokeStyle = `rgba(154,220,255,${0.45 + Math.sin(t * 4) * 0.2})`; ctx.fillStyle = "rgba(154,220,255,0.08)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -42, 30, 52, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      // étourdi : étoiles qui tournent
      if (u.etourdi > 0) for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; ctx.fillStyle = "#fff2a0"; ctx.font = "10px sans-serif"; ctx.fillText("★", Math.cos(a) * 18 - 4, ry - 22 + Math.sin(a) * 5); }
      if (u.renfort > 0) { ctx.fillStyle = `rgba(255,216,74,${0.5 + Math.sin(t * 5) * 0.3})`; ctx.font = "11px sans-serif"; ctx.fillText("▲", 14, ry - 10); }
      if (u.faible > 0) { ctx.fillStyle = "rgba(200,154,255,0.85)"; ctx.font = "11px sans-serif"; ctx.fillText("▼", -22, ry - 10); }
      ctx.restore();
      // nom + barre de vie
      ctx.save();
      const by = y - 112 * s, bw = 54 * s;
      ctx.globalAlpha = 1 - e.ko * 0.6;
      ctx.font = `600 ${Math.round(10 * s + 1)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = "#f2ecdc";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 3; ctx.fillText(u.nom.length > 12 ? u.nom.slice(0, 11) + "…" : u.nom, x, by - 4); ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x - bw / 2, by, bw, 5);
      if (e.pvAff === undefined) e.pvAff = e.pv;
      e.pvAff += (e.pv - e.pvAff) * 0.12;
      const k1 = Math.max(0, e.pvAff / u.pvMax), k2 = Math.max(0, e.pv / u.pvMax);
      ctx.fillStyle = "#ffef9a"; ctx.fillRect(x - bw / 2, by, bw * k1, 5);
      ctx.fillStyle = k2 < 0.3 ? "#e05050" : u.camp === "moi" ? "#5fd18a" : "#e07a5a"; ctx.fillRect(x - bw / 2, by, bw * k2, 5);
      if (e.bouclier > 0) { ctx.fillStyle = "rgba(154,220,255,0.85)"; ctx.fillRect(x - bw / 2, by + 5, bw * Math.min(1, e.bouclier / u.pvMax), 2); }
      ctx.restore();
    }
    function dessinerParticule(p) {
      const k = 1 - p.age / p.vie;
      ctx.globalAlpha = Math.max(0, k);
      ctx.globalCompositeOperation = p.add ? "lighter" : "source-over";
      ctx.fillStyle = p.couleur; ctx.strokeStyle = p.couleur;
      const t = p.taille * (p.forme === "fumee" ? 1 + (1 - k) : 1);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      switch (p.forme) {
        case "goutte": ctx.beginPath(); ctx.arc(0, 0, t * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-t * 0.6, 0); ctx.lineTo(0, -t * 1.6); ctx.lineTo(t * 0.6, 0); ctx.fill(); break;
        case "eclat": ctx.beginPath(); ctx.moveTo(0, -t * 1.4); ctx.lineTo(t * 0.5, 0); ctx.lineTo(0, t * 1.4); ctx.lineTo(-t * 0.5, 0); ctx.closePath(); ctx.fill(); break;
        case "feuille": ctx.beginPath(); ctx.ellipse(0, 0, t, t * 0.45, 0, 0, Math.PI * 2); ctx.fill(); break;
        case "bulle": ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, t, 0, Math.PI * 2); ctx.stroke(); break;
        case "fumee": ctx.globalAlpha = Math.max(0, k * 0.55); ctx.beginPath(); ctx.arc(0, 0, t, 0, Math.PI * 2); ctx.fill(); break;
        case "roche": ctx.fillRect(-t / 2, -t / 2, t, t); break;
        case "etoile": ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? t * 0.4 : t; ctx.lineTo(Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r); } ctx.closePath(); ctx.fill(); break;
        case "croix": ctx.fillRect(-t / 4, -t, t / 2, t * 2); ctx.fillRect(-t, -t / 4, t * 2, t / 2); break;
        case "fleche": ctx.beginPath(); ctx.moveTo(0, -t); ctx.lineTo(t * 0.7, 0); ctx.lineTo(-t * 0.7, 0); ctx.closePath(); ctx.fill(); break;
        case "trait": ctx.lineWidth = Math.max(1, t * 0.6); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-t * 3, 0); ctx.lineTo(t * 3, 0); ctx.stroke(); break;
        default: ctx.beginPath(); ctx.arc(0, 0, t, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    let erreurBoucle = null;
    function image(now) {
      if (!vivante) return;
      try { imageSure(now); }
      catch (e) {
        if (!erreurBoucle) { erreurBoucle = e.message || String(e); console.error("Duel", e); }
        try { for (let k = 0; k < 8; k++) ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.font = "11px system-ui"; ctx.fillStyle = "#ff8a8a"; ctx.textAlign = "left"; ctx.fillText("⚠ " + erreurBoucle.slice(0, 100), 8, H_D - 32); } catch (_) {}
        requestAnimationFrame(image);
      }
    }
    function imageSure(now) {
      if (!document.body.contains(canvas)) { vivante = false; return; }
      const dt = Math.min(0.05, (now - dernier) / 1000); dernier = now;
      const t = (now - t0) / 1000;
      ctx.save();
      if (secousse > 0.2) { ctx.translate(rnd(-secousse, secousse), rnd(-secousse, secousse)); secousse *= 0.86; }
      fond(t);
      // personnages, du fond vers l'avant
      tous().map((u) => [u, E(u).y]).sort((a, b) => a[1] - b[1]).forEach(([u]) => personnage(u, t));
      // projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const q = projectiles[i], k = Math.min(1, (now - q.debut) / q.d);
        const x = q.a.x + (q.b.x - q.a.x) * k, y = q.a.y + (q.b.y - q.a.y) * k - Math.sin(k * Math.PI) * q.h;
        const E2 = ELEMENTS[q.el] || ELEMENTS.physique;
        trainee(x, y, q.el);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const r = 9 * q.gros, gr = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
        gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.3, E2.c1); gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        if (k >= 1) { projectiles.splice(i, 1); q.fin(); }
      }
      // éclairs
      eclairs.forEach((z) => { z.age += dt; ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = Math.random() < 0.5 ? "#ffffff" : "#d8c8ff"; ctx.lineWidth = 3; ctx.shadowColor = "#b48cff"; ctx.shadowBlur = 14; ctx.beginPath(); z.pts.forEach((p, i) => (i ? ctx.lineTo(p.x + rnd(-2, 2), p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.restore(); });
      for (let i = eclairs.length - 1; i >= 0; i--) if (eclairs[i].age > eclairs[i].vie) eclairs.splice(i, 1);
      // anneaux d'impact
      anneaux.forEach((a) => { a.age += dt; const k = a.age / a.vie; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = a.couleur; ctx.lineWidth = a.plein ? 3 : 2.5; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r + (a.rmax - a.r) * k, (a.r + (a.rmax - a.r) * k) * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); });
      for (let i = anneaux.length - 1; i >= 0; i--) if (anneaux[i].age > anneaux[i].vie) anneaux.splice(i, 1);
      // particules
      ctx.save();
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt;
        if (p.age >= p.vie) { parts.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= 0.985;
        dessinerParticule(p);
      }
      ctx.restore();
      // chiffres flottants
      textes.forEach((z) => { z.age += dt; const k = z.age / z.vie; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4); ctx.font = `800 ${z.gros ? 22 : 16}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.8)"; const yy = z.y - k * 34 - (z.gros ? Math.sin(Math.min(1, k * 4) * Math.PI) * 6 : 0); ctx.strokeText(z.txt, z.x, yy); ctx.fillStyle = z.couleur; ctx.fillText(z.txt, z.x, yy); ctx.restore(); });
      for (let i = textes.length - 1; i >= 0; i--) if (textes[i].age > textes[i].vie) textes.splice(i, 1);
      // bannière du nom de la compétence
      if (banniere) {
        banniere.age += dt; const k = banniere.age / banniere.vie;
        if (k >= 1) banniere = null;
        else {
          const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
          ctx.save(); ctx.globalAlpha = a;
          const g2 = ctx.createLinearGradient(0, 0, W, 0); g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(0.5, "rgba(10,8,25,0.85)"); g2.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g2; ctx.fillRect(0, 238, W, 42);
          ctx.textAlign = "center"; ctx.font = "700 18px Georgia, serif"; ctx.fillStyle = banniere.couleur; ctx.shadowColor = banniere.couleur; ctx.shadowBlur = 10;
          ctx.fillText(banniere.txt, W / 2, 260); ctx.shadowBlur = 0;
          ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#d8d4c8"; ctx.fillText(banniere.sous, W / 2, 274);
          ctx.restore();
        }
      }
      if (flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(-20, -20, W + 40, H + 40); flash *= 0.8; }
      ctx.restore();
      requestAnimationFrame(image);
    }
    requestAnimationFrame(image);
    canvas.onclick = (ev) => {
      const r = canvas.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * W, y = ((ev.clientY - r.top) / r.height) * H;
      let mieux = null, dmin = 1e9;
      tous().forEach((u) => { const e = E(u), hh = e.h || 100 * e.s, d = Math.hypot(x - e.x, (y - (e.y - hh / 2)) * 0.7); if (d < Math.max(46 * e.s, hh * 0.5) && d < dmin) { dmin = d; mieux = u; } });
      if (mieux) surTap(mieux);
    };
    return {
      jouer, etourdi,
      setCiblables: (l) => { ciblables = new Set(l.map((u) => u.uid)); },
      sync: () => tous().forEach((u) => { const s = E(u); s.pv = u.pv; s.bouclier = u.bouclier; }),
      arreter: () => { vivante = false; },
    };
  }

  /* ---------- Compétences créées sans IA (quand l'IA est indisponible) ---------- */
  const NOMS_LOCAUX = {
    sang: ["Griffes sanglantes", "Morsure écarlate", "Pluie de sang", "Malédiction du sang", "Transfusion", "Carapace de sang", "Soif de sang"],
    feu: ["Frappe ardente", "Boule de feu", "Brasier", "Flammes aveuglantes", "Flamme de vie", "Mur de flammes", "Cœur ardent"],
    glace: ["Lame de givre", "Lance de glace", "Blizzard", "Prison de glace", "Souffle frais", "Armure de glace", "Hiver éternel"],
    foudre: ["Poing électrique", "Éclair", "Orage", "Décharge paralysante", "Étincelle de vie", "Champ électrique", "Surtension"],
    lumiere: ["Frappe sacrée", "Lance de lumière", "Jugement céleste", "Éclat aveuglant", "Lumière apaisante", "Égide divine", "Bénédiction"],
    ombre: ["Lame d'ombre", "Étreinte des ténèbres", "Nuit abyssale", "Terreur", "Ombre réparatrice", "Voile d'ombre", "Pacte obscur"],
    nature: ["Coup de ronce", "Lianes", "Tempête de feuilles", "Racines entravantes", "Sève guérisseuse", "Écorce", "Appel de la forêt"],
    poison: ["Dague empoisonnée", "Venin", "Nuage toxique", "Paralysie", "Antidote", "Peau d'écailles", "Rage venimeuse"],
    eau: ["Frappe des marées", "Jet d'eau", "Raz-de-marée", "Chant envoûtant", "Source de vie", "Bulle d'eau", "Chant des abysses"],
    vent: ["Coup de vent", "Lame d'air", "Tornade", "Bourrasque", "Brise légère", "Mur de vent", "Vent porteur"],
    terre: ["Poing de pierre", "Rocher", "Séisme", "Écrasement", "Force tellurique", "Peau de pierre", "Colère de la terre"],
    arcane: ["Projectile arcanique", "Rayon astral", "Pluie d'étoiles", "Sceau", "Restauration", "Barrière runique", "Amplification"],
    physique: ["Coup d'épée", "Frappe puissante", "Tourbillon", "Coup assommant", "Premiers soins", "Garde", "Cri de guerre"],
  };
  function elementDeFiche(f) {
    const t = normal(`${f.titre || ""} ${f.resume || ""} ${(f.infos || []).map((i) => `${i.cle} ${i.valeur}`).join(" ")}`);
    const scores = MOTS_ELEMENTS.map(([e, re]) => [e, (t.match(new RegExp(re.source, "g")) || []).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (scores.length) return scores[0][0];
    const race = normal(infoPerso(f, /race|peuple|espece/));
    for (const [re, e] of ELEMENT_RACE) if (re.test(race)) return e;
    return "physique";
  }
  // Le nom de la magie écrit sur la fiche (case « Magie », « Pouvoir »… ou « magie des … » dans le résumé)
  function magieDe(f) {
    const info = (f.infos || []).find((i) => /magie|pouvoir|capacit|\bdon\b|affinit|element|aptitude/.test(normal(i.cle)) && String(i.valeur || "").trim());
    let t = info ? sansMarkdown(info.valeur) : "";
    if (!t) { const m = sansMarkdown(`${f.resume || ""}`).match(/magie\s+(?:des|du|de la|de l'|de l’|d'|d’|de)\s*([a-zàâäéèêëîïôöùûüç' -]{3,30})/i); if (m) t = m[1]; }
    t = t.split(/[,;.()/\n]| et /)[0].replace(/^\s*(la |le |les |l'|l’)?magie\s+(des|du|de la|de l'|de l’|d'|d’|de)\s*/i, "").replace(/^(la |le |les |l'|l’)/i, "").trim();
    if (!t || t.length > 28 || /^(aucun|aucune|non|inconnu|rien|\?)/i.test(t)) return null;
    return t.toLowerCase();
  }
  const deMot = (m) => (/^[aeiouyhàâéèêîôû]/i.test(m) ? "d'" : "de ") + m;
  // Magies spéciales : de vrais kits de compétences, utilisés quand l'IA n'a pas encore fait le personnage
  const KITS_MAGIE = [
    { re: motsDebut(["sceau", "sceaux", "scell", "fuin", "glyphe"]), el: "arcane", kit: (role) => [
      role === "soutien" ? ["Sceau de guérison", "soin", "allie", 1, 0, "Un sceau se pose sur la blessure et la referme."] : ["Rupture de sceau", "degats", "ennemi", 1, 0, "Il brise un sceau et libère l'énergie qu'il contenait."],
      ["Sceau d'entrave", "etourdir", "ennemi", 2, 2, "Un sceau s'imprime sur l'ennemi et bloque ses mouvements."],
      ["Sceau de scellement", "affaiblir", "ennemi", 2, 2, "Le sceau enferme une partie du pouvoir de l'ennemi."],
      ["Sceau protecteur", "bouclier", role === "soutien" ? "tous_allies" : "allie", 2, 3, "Un cercle de sceaux protège ses alliés."],
    ] },
    { re: motsDebut(["cartes?\\b", "jeu de cartes", "joker", "tarot", "atout"]), el: "arcane", kit: (role) => [
      role === "soutien" ? ["Carte de Cœur ♥", "soin", "allie", 1, 0, "Une carte de cœur se dissout en lumière qui soigne."] : ["Carte de Pique ♠", "degats", "ennemi", 1, 0, "Une carte tranchante file vers l'ennemi."],
      ["Carte de Carreau ♦", "affaiblir", "ennemi", 2, 2, "La réalité se tord autour de l'ennemi, qui frappe moins fort."],
      ["Carte de Trèfle ♣", "bouclier", "allie", 2, 2, "Des cartes de trèfle forment un bouclier."],
      ["Coup de Théâtre 🃏", "degats", "tous_ennemis", 3, 4, "Le Joker abat sa carte maîtresse : tout le camp adverse est frappé."],
    ] },
    { re: motsDebut(["metamorph", "transform", "change-forme", "changeforme", "polymorph", "lycan", "garou", "forme animale", "forme bestiale", "mue\\b"]), el: "nature", portee: "melee", kit: (role) => [
      role === "soutien" ? ["Mue régénératrice", "soin", "allie", 1, 0, "Son corps se remodèle et referme les blessures."] : ["Griffes de bête", "degats", "ennemi", 1, 0, "Ses mains deviennent des griffes et lacèrent l'ennemi."],
      ["Forme de colosse", "provocation", "soi", 2, 3, "Il prend une forme massive qui attire tous les coups."],
      ["Fureur bestiale", "renfort", role === "soutien" ? "tous_allies" : "soi", 2, 3, "Il se transforme en prédateur et frappe bien plus fort."],
      ["Charge du fauve", "etourdir", "ennemi", 2, 2, "Il bondit sous forme animale et renverse l'ennemi."],
    ] },
    { re: motsDebut(["illusion", "mirage", "leurre", "hallucin", "trompe"]), el: "arcane", kit: (role) => [
      role === "soutien" ? ["Voile trompeur", "bouclier", "allie", 1, 0, "Une illusion cache l'allié aux yeux de l'ennemi."] : ["Lame illusoire", "degats", "ennemi", 1, 0, "Une arme imaginaire… qui fait de vrais dégâts."],
      ["Mirage aveuglant", "etourdir", "ennemi", 2, 2, "L'ennemi est perdu dans un mirage et ne sait plus où frapper."],
      ["Doubles trompeurs", "bouclier", "tous_allies", 2, 3, "Des copies illusoires détournent les attaques."],
      ["Cauchemar éveillé", "affaiblir", "ennemi", 2, 2, "L'ennemi voit ses pires peurs et perd ses moyens."],
    ] },
    { re: motsDebut(["temps", "temporel", "chrono", "horloge", "sablier"]), el: "lumiere", kit: (role) => [
      role === "soutien" ? ["Retour en arrière", "soin", "allie", 1, 0, "Il ramène le corps de l'allié à quelques instants plus tôt."] : ["Coup accéléré", "degats", "ennemi", 1, 0, "Il frappe si vite que le coup arrive avant d'être vu."],
      ["Arrêt du temps", "etourdir", "ennemi", 3, 3, "Le temps se fige autour de l'ennemi."],
      ["Ralentissement", "affaiblir", "ennemi", 2, 2, "L'ennemi bouge au ralenti."],
      ["Accélération", "renfort", "tous_allies", 2, 3, "Le temps s'accélère pour ses alliés."],
    ] },
    { re: motsDebut(["gravit", "pesanteur", "apesanteur"]), el: "ombre", kit: (role) => [
      role === "soutien" ? ["Allègement", "bouclier", "allie", 1, 0, "Les coups glissent sur l'allié, devenu léger."] : ["Poids écrasant", "degats", "ennemi", 1, 0, "La gravité s'abat sur l'ennemi."],
      ["Puits gravitationnel", "degats", "tous_ennemis", 2, 3, "Tous les ennemis sont écrasés au sol."],
      ["Cloué au sol", "etourdir", "ennemi", 2, 2, "L'ennemi est plaqué au sol et ne peut plus bouger."],
      ["Fardeau", "affaiblir", "ennemi", 2, 2, "Chaque geste de l'ennemi pèse une tonne."],
    ] },
    { re: motsDebut(["invoc", "familier", "conjur", "esprit allie"]), el: "arcane", kit: (role) => [
      role === "soutien" ? ["Esprit soigneur", "soin", "allie", 1, 0, "Une créature invoquée soigne l'allié."] : ["Assaut du familier", "degats", "ennemi", 1, 0, "Sa créature invoquée attaque."],
      ["Gardien invoqué", "bouclier", "allie", 2, 2, "Un gardien apparaît pour protéger un allié."],
      ["Horde", "degats", "tous_ennemis", 2, 3, "Plusieurs créatures surgissent et attaquent tout le monde."],
      ["Entrave spectrale", "etourdir", "ennemi", 2, 2, "Les créatures retiennent l'ennemi."],
    ] },
    { re: motsDebut(["necro", "mort-vivant", "morts-vivants", "cadavre", "squelette", "zombie", "faucheur"]), el: "ombre", kit: (role) => [
      role === "soutien" ? ["Vol de vie", "soin", "allie", 1, 0, "Il arrache un peu de vie à la mort pour soigner."] : ["Toucher de la mort", "degats", "ennemi", 1, 0, "Un froid mortel traverse l'ennemi."],
      ["Armée des morts", "degats", "tous_ennemis", 2, 3, "Des morts se relèvent et attaquent."],
      ["Malédiction funèbre", "affaiblir", "ennemi", 2, 2, "L'ennemi se vide de ses forces."],
      ["Os protecteurs", "bouclier", "allie", 2, 2, "Une carapace d'os entoure un allié."],
    ] },
    { re: motsDebut(["telekin", "psychokin", "telepath", "psychi", "mental"]), el: "arcane", kit: (role) => [
      role === "soutien" ? ["Lien mental", "renfort", "allie", 1, 0, "Il guide l'esprit de son allié, qui frappe juste."] : ["Projection mentale", "degats", "ennemi", 1, 0, "Une force invisible projette l'ennemi."],
      ["Choc psychique", "etourdir", "ennemi", 2, 2, "L'esprit de l'ennemi se fige."],
      ["Barrière mentale", "bouclier", "tous_allies", 2, 3, "Une force invisible repousse les coups."],
      ["Domination", "affaiblir", "ennemi", 2, 2, "Il s'insinue dans l'esprit de l'ennemi et le fait hésiter."],
    ] },
    { re: motsDebut(["sonor", "musiq", "chant", "melodi", "barde", "vibration", "onde"]), el: "vent", kit: (role) => [
      role === "soutien" ? ["Mélodie apaisante", "soin", "allie", 1, 0, "Une mélodie douce referme les blessures."] : ["Onde de choc", "degats", "ennemi", 1, 0, "Une onde sonore frappe l'ennemi."],
      ["Cri assourdissant", "etourdir", "ennemi", 2, 2, "L'ennemi, sonné, ne peut plus agir."],
      ["Chant de guerre", "renfort", "tous_allies", 2, 3, "Le rythme pousse ses alliés à frapper plus fort."],
      ["Fausse note", "affaiblir", "ennemi", 2, 2, "Une vibration dérègle les gestes de l'ennemi."],
    ] },
    { re: motsDebut(["espace", "spatial", "portail", "teleport", "dimension", "distorsion"]), el: "arcane", kit: (role) => [
      role === "soutien" ? ["Repli spatial", "bouclier", "allie", 1, 0, "Il déplace l'allié hors de portée au dernier moment."] : ["Coupure spatiale", "degats", "ennemi", 1, 0, "L'espace se déchire sur l'ennemi."],
      ["Portail piège", "etourdir", "ennemi", 2, 2, "L'ennemi tombe dans un portail et revient trop tard."],
      ["Effondrement", "degats", "tous_ennemis", 3, 4, "L'espace s'effondre sur tout le camp adverse."],
      ["Distorsion", "affaiblir", "ennemi", 2, 2, "Les coups de l'ennemi n'arrivent plus où il vise."],
    ] },
    { re: motsDebut(["mots?\\b", "parole", "verbe", "incantation", "nom veritable", "vrais noms", "ecritur", "runes? parl"]), el: "arcane", kit: (role) => [
      role === "soutien" ? ["Mot de guérison", "soin", "allie", 1, 0, "Il prononce « guéris » et la blessure se referme."] : ["Mot de pouvoir", "degats", "ennemi", 1, 0, "Un mot prononcé frappe comme un coup."],
      ["« Arrête »", "etourdir", "ennemi", 3, 3, "Un seul mot, et l'ennemi est obligé d'obéir."],
      ["« Protège »", "bouclier", "tous_allies", 2, 3, "Le mot se matérialise autour de ses alliés."],
      ["« Faiblis »", "affaiblir", "ennemi", 2, 2, "Le mot s'imprime sur l'ennemi et le vide de sa force."],
    ] },
  ];
  function competencesLocales(f) {
    const x = forces(f), t = normal(`${f.resume || ""} ${(f.infos || []).map((i) => i.valeur).join(" ")}`);
    let role = x.soutien > x.attaque && x.soutien >= x.defense ? "soutien" : x.defense > x.attaque ? "defenseur" : "attaquant";
    if (/\b(soign|gueri|soin|medec|pretre|pretresse|benedic|infirm|herbor)/.test(t)) role = "soutien";
    else if (/\b(bouclier|garde|protect|chevalier|paladin|sentinelle)/.test(t)) role = "defenseur";
    const el = elementDeFiche(f), mg = magieDe(f);
    // avec une magie précise sur la fiche, les compétences portent son nom (ex : « Tempête de cartes », « Bouclier de mots »)
    const n = mg ? [`Frappe ${deMot(mg)}`, `Éclat ${deMot(mg)}`, `Tempête ${deMot(mg)}`, `Emprise ${deMot(mg)}`, `Souffle ${deMot(mg)}`, `Rempart ${deMot(mg)}`, `Éveil ${deMot(mg)}`].map((x) => x.slice(0, 30))
      : NOMS_LOCAUX[el] || NOMS_LOCAUX.physique;
    const c = (nom, type, cible, puissance, recharge, portee) => ({ nom, type, cible, puissance, recharge, element: el, portee, description: "" });
    // on ne regarde que ce qui parle de sa magie (pas tout le résumé : « en même temps » ne doit pas donner la magie du temps)
    const autourMagie = (normal(sansMarkdown(f.resume || "")).match(/(?:magie|pouvoir|maitr|manipul|controle|utilise|art)\S*\s[^.;]{0,45}/g) || []).join(" ");
    const texteMagie = normal(`${mg || ""} ${(f.infos || []).filter((i) => /magie|pouvoir|capacit|\bdon\b|aptitude/.test(normal(i.cle))).map((i) => i.valeur).join(" ")} ${autourMagie}`);
    const special = KITS_MAGIE.find((k) => k.re.test(texteMagie));
    if (special) return { fiche_id: f.id, role, puissance: puissance(f), competences: special.kit(role).map(([nom, type, cible, p, r, description]) => ({ nom, type, cible, puissance: p, recharge: r, element: special.el, portee: special.portee || (type === "provocation" ? "melee" : "distance"), description })) };
    const competences = role === "soutien"
      ? [c(n[4], "soin", "allie", 1, 0, "distance"), c(!mg && el === "physique" ? "Second souffle" : n[6], "soin", "tous_allies", 2, 3, "distance"), c(n[5], "bouclier", "allie", 2, 2, "distance"), c(n[1], "degats", "ennemi", 2, 1, "distance")]
      : role === "defenseur"
      ? [c(n[0], "degats", "ennemi", 1, 0, "melee"), c(NOMS_LOCAUX.physique[6], "provocation", "soi", 2, 3, "melee"), c(n[5], "bouclier", "allie", 2, 2, "distance"), c(n[3], "etourdir", "ennemi", 2, 2, "melee")]
      : [c(n[0], "degats", "ennemi", 1, 0, el === "physique" ? "melee" : "distance"), c(n[1], "degats", "ennemi", 3, 2, "distance"), c(n[2], "degats", "tous_ennemis", 2, 3, "distance"), c(n[3], x.attaque % 2 ? "etourdir" : "affaiblir", "ennemi", 2, 2, "distance")];
    return { fiche_id: f.id, role, competences, puissance: puissance(f) };
  }

  /* ---------- Arènes du Duel ---------- */
  const ARENES = {
    cathedrale: { nom: "Cathédrale de la lune rouge", ic: "🌕" },
    foret: { nom: "Forêt maudite", ic: "🌲" },
    celeste: { nom: "Palais céleste", ic: "☁️" },
    abysses: { nom: "Abysses", ic: "🌊" },
    enfers: { nom: "Enfers", ic: "🔥" },
    neige: { nom: "Citadelle gelée", ic: "❄️" },
    trone: { nom: "Salle du trône", ic: "👑" },
  };
  // un lieu du wiki devient l'arène qui lui ressemble le plus
  function areneDeLieu(f) {
    const t = normal(`${f.titre} ${f.resume || ""} ${(f.infos || []).map((i) => i.valeur).join(" ")}`);
    return /enfer|lave|volcan|brasier|flamm|demon/.test(t) ? "enfers" : /mer\b|ocean|abyss|sous-marin|lac|eau\b|sirene|maree/.test(t) ? "abysses"
      : /ciel|celest|nuage|paradis|ange|divin/.test(t) ? "celeste" : /neige|glace|givre|nord|hiver|gel/.test(t) ? "neige"
      : /foret|bois|sylv|arbre|jungle|marais/.test(t) ? "foret" : /palais|trone|chateau|royaume|cour\b|capitale/.test(t) ? "trone" : "cathedrale";
  }
  function dessinerArene(ctx, nom, t, W, H, SOLY) {
    const ciel = (c) => { const g = ctx.createLinearGradient(0, 0, 0, H); c.forEach(([k, v]) => g.addColorStop(k, v)); ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40); };
    const sol = (c1, c2, lignes) => { const g = ctx.createLinearGradient(0, 230, 0, H); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(-20, 230, W + 40, H); if (lignes) { ctx.strokeStyle = lignes; ctx.lineWidth = 1; for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 40, 230); ctx.lineTo(W / 2 + i * 120, H); ctx.stroke(); } } };
    const poussiere = (coul, n, vy) => { for (let i = 0; i < n; i++) { const x = (i * 97 + t * 10 * ((i % 3) + 1)) % W, y = ((i * 41 + t * vy * ((i % 4) + 1)) % H + H) % H; ctx.fillStyle = coul; ctx.globalAlpha = 0.25 + (i % 4) * 0.12; ctx.fillRect(x, y, 1.8, 1.8); } ctx.globalAlpha = 1; };
    const astre = (x, y, r, c, halo) => { ctx.fillStyle = c; ctx.globalAlpha = halo; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, 7); ctx.fill(); ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; };
    switch (nom) {
      case "foret": {
        ciel([[0, "#0a1410"], [0.6, "#1a2a1c"], [1, "#0a0c08"]]);
        astre(110, 60, 22, "#c8e8b0", 0.12);
        for (let c = 0; c < 3; c++) { ctx.fillStyle = ["#0e1a12", "#0a140e", "#060a07"][c]; for (let i = 0; i < 12; i++) { const x = i * 62 - 20 + c * 25, h = 120 + ((i * 37 + c * 13) % 70); ctx.beginPath(); ctx.moveTo(x, 232); ctx.lineTo(x + 14, 232 - h); ctx.lineTo(x + 28, 232); ctx.fill(); ctx.fillRect(x + 11, 200, 6, 32); } }
        sol("#14200f", "#070a05", null);
        ctx.fillStyle = "rgba(160,220,140,0.06)"; for (let i = 0; i < 3; i++) ctx.fillRect(-20, 250 + i * 20 + Math.sin(t + i) * 4, W + 40, 14);
        for (let i = 0; i < 14; i++) { const x = (i * 53 + Math.sin(t * 0.7 + i) * 30 + t * 6) % W, y = 120 + (i * 29) % 150 + Math.sin(t * 2 + i) * 10; ctx.fillStyle = `rgba(200,255,120,${0.4 + Math.sin(t * 4 + i) * 0.4})`; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
        break;
      }
      case "celeste": {
        ciel([[0, "#5a7ad0"], [0.5, "#c8d8f8"], [0.64, "#f4ecd8"], [1, "#d8c8a0"]]);
        astre(500, 60, 30, "#fff6d0", 0.35);
        ctx.fillStyle = "rgba(255,255,255,0.85)"; for (let i = 0; i < 7; i++) { const x = ((i * 120 + t * 8) % (W + 160)) - 80, y = 50 + (i % 3) * 40; ctx.beginPath(); ctx.ellipse(x, y, 50, 12, 0, 0, 7); ctx.ellipse(x + 26, y - 8, 30, 12, 0, 0, 7); ctx.fill(); }
        ctx.fillStyle = "#e8e0f0"; for (let i = 0; i < 7; i++) { const x = 30 + i * 100; ctx.fillRect(x, 120, 16, 112); ctx.fillRect(x - 4, 116, 24, 6); ctx.fillRect(x - 4, 228, 24, 6); }
        ctx.strokeStyle = "rgba(255,230,150,0.3)"; ctx.lineWidth = 6; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(470 + i * 20, 70); ctx.lineTo(300 + i * 90, 232); ctx.stroke(); }
        sol("#f0e6cc", "#b8a070", "rgba(200,160,80,0.25)");
        poussiere("#fff6c0", 20, -6);
        break;
      }
      case "abysses": {
        ciel([[0, "#06223a"], [0.6, "#0a3a5a"], [1, "#021018"]]);
        ctx.globalCompositeOperation = "lighter"; for (let i = 0; i < 5; i++) { const x = 80 + i * 130 + Math.sin(t * 0.5 + i) * 20; const g = ctx.createLinearGradient(x, 0, x + 40, 260); g.addColorStop(0, "rgba(120,200,255,0.18)"); g.addColorStop(1, "rgba(120,200,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 80, 260); ctx.lineTo(x + 20, 260); ctx.fill(); } ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#052030"; for (let i = 0; i < 8; i++) { const x = i * 90; ctx.beginPath(); ctx.moveTo(x, 232); ctx.quadraticCurveTo(x + 20, 140 - (i % 3) * 30, x + 50, 232); ctx.fill(); }
        for (let i = 0; i < 4; i++) { const x = (i * 170 + t * 12) % (W + 60) - 30, y = 80 + i * 30 + Math.sin(t + i) * 10; ctx.fillStyle = "rgba(220,150,255,0.35)"; ctx.beginPath(); ctx.arc(x, y, 10, Math.PI, 0); ctx.fill(); ctx.strokeStyle = "rgba(220,150,255,0.3)"; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * 4, y); ctx.quadraticCurveTo(x + k * 4 + Math.sin(t * 3 + k) * 4, y + 12, x + k * 3, y + 24); ctx.stroke(); } }
        sol("#0a2a3a", "#020a10", "rgba(120,200,255,0.12)");
        for (let i = 0; i < 18; i++) { const x = (i * 71) % W + Math.sin(t + i) * 6, y = H - ((t * 30 + i * 47) % H); ctx.strokeStyle = "rgba(200,240,255,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, 7); ctx.stroke(); }
        break;
      }
      case "enfers": {
        ciel([[0, "#1a0404"], [0.55, "#5a1006"], [1, "#100202"]]);
        ctx.fillStyle = "#200606"; for (let i = 0; i < 8; i++) { const x = i * 95 - 20; ctx.beginPath(); ctx.moveTo(x, 232); ctx.lineTo(x + 30, 90 + (i % 3) * 40); ctx.lineTo(x + 70, 232); ctx.fill(); }
        ctx.strokeStyle = "#ff5a1a"; ctx.shadowColor = "#ff5a1a"; ctx.shadowBlur = 10; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(60 + i * 160, 232); ctx.lineTo(70 + i * 160, 180); ctx.lineTo(62 + i * 160, 150); ctx.stroke(); } ctx.shadowBlur = 0;
        sol("#2a0804", "#0a0201", null);
        const g = ctx.createLinearGradient(0, H - 30, 0, H); g.addColorStop(0, "rgba(255,90,20,0)"); g.addColorStop(1, `rgba(255,90,20,${0.4 + Math.sin(t * 2) * 0.1})`); ctx.fillStyle = g; ctx.fillRect(0, H - 30, W, 30);
        for (let i = 0; i < 26; i++) { const x = (i * 61 + Math.sin(t + i) * 12) % W, y = H - ((t * 40 * ((i % 3) + 1) + i * 37) % H); ctx.fillStyle = `rgba(255,${120 + (i % 4) * 30},40,${0.5 + (i % 3) * 0.15})`; ctx.fillRect(x, y, 2, 2); }
        break;
      }
      case "neige": {
        ciel([[0, "#0a1430"], [0.6, "#2a3a60"], [1, "#0a1020"]]);
        astre(120, 70, 26, "#e8f0ff", 0.18);
        ctx.fillStyle = "#1a2440"; for (let i = 0; i < 6; i++) { const x = 300 + i * 50, h = 90 + (i % 3) * 40; ctx.fillRect(x, 232 - h, 30, h); ctx.beginPath(); ctx.moveTo(x - 4, 232 - h); ctx.lineTo(x + 15, 232 - h - 40); ctx.lineTo(x + 34, 232 - h); ctx.fill(); ctx.fillStyle = "rgba(255,220,150,0.6)"; ctx.fillRect(x + 12, 232 - h + 20, 5, 8); ctx.fillStyle = "#1a2440"; }
        ctx.fillStyle = "#c8d8f0"; for (let i = 0; i < 6; i++) { const x = 300 + i * 50, h = 90 + (i % 3) * 40; ctx.beginPath(); ctx.moveTo(x - 4, 232 - h); ctx.lineTo(x + 15, 232 - h - 40); ctx.lineTo(x + 8, 232 - h - 20); ctx.fill(); }
        sol("#c8d8ec", "#7a8aa8", "rgba(255,255,255,0.3)");
        for (let i = 0; i < 40; i++) { const x = ((i * 53 + t * 20 + Math.sin(t + i) * 20) % W + W) % W, y = (i * 29 + t * 30 * (1 + (i % 3) * 0.5)) % H; ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, 7); ctx.fill(); }
        break;
      }
      case "trone": {
        ciel([[0, "#1a0e14"], [0.62, "#3a1a1e"], [1, "#0e0808"]]);
        ctx.fillStyle = "#6a0a14"; for (let i = 0; i < 4; i++) { const x = 40 + i * 170; ctx.fillRect(x, 20, 46, 120); ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x + 23, 160); ctx.lineTo(x + 46, 140); ctx.fill(); ctx.fillStyle = "#c8a050"; ctx.fillRect(x + 18, 60, 10, 10); ctx.fillStyle = "#6a0a14"; }
        ctx.fillStyle = "#2a1414"; ctx.fillRect(W / 2 - 40, 120, 80, 112); ctx.fillStyle = "#c8a050"; ctx.fillRect(W / 2 - 46, 112, 92, 8); ctx.beginPath(); ctx.moveTo(W / 2 - 40, 112); ctx.lineTo(W / 2, 80); ctx.lineTo(W / 2 + 40, 112); ctx.fill();
        for (let i = 0; i < 6; i++) { const x = 20 + i * 125; ctx.fillStyle = "#c8a050"; ctx.fillRect(x, 180, 4, 52); const fl = Math.sin(t * 8 + i) * 2; ctx.fillStyle = "rgba(255,200,100,0.9)"; ctx.beginPath(); ctx.ellipse(x + 2, 174 + fl * 0.3, 4, 8 + fl, 0, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(255,180,80,0.08)"; ctx.beginPath(); ctx.arc(x + 2, 176, 30, 0, 7); ctx.fill(); }
        sol("#2a1a1a", "#0a0606", null);
        ctx.fillStyle = "rgba(140,10,20,0.5)"; ctx.beginPath(); ctx.moveTo(W / 2 - 40, 232); ctx.lineTo(W / 2 + 40, 232); ctx.lineTo(W / 2 + 140, H); ctx.lineTo(W / 2 - 140, H); ctx.fill();
        ctx.strokeStyle = "rgba(200,160,80,0.25)"; for (let k = 0; k < 6; k++) { const y = 240 + Math.pow(k / 5, 1.5) * 120; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        break;
      }
      default: {
        ciel([[0, "#120a22"], [0.62, "#3a1a30"], [0.64, "#1c1320"], [1, "#0a0710"]]);
        astre(520, 70, 34, "#a01020", 0.15);
        ctx.fillStyle = "#1a0e1c"; for (let i = 0; i < 9; i++) { const x = i * 80 - 10, h = 70 + (i % 3) * 34; ctx.fillRect(x, 230 - h, 28, h); ctx.beginPath(); ctx.moveTo(x - 4, 230 - h); ctx.lineTo(x + 14, 230 - h - 34); ctx.lineTo(x + 32, 230 - h); ctx.fill(); }
        ctx.strokeStyle = "rgba(227,184,102,0.14)"; ctx.lineWidth = 1; for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 40, 230); ctx.lineTo(W / 2 + i * 120, H); ctx.stroke(); }
        poussiere("#f5d08a", 20, 0);
      }
    }
  }

  /* ---------- Sons et musique du Duel (synthétisés : aucun fichier à télécharger) ---------- */
  const SON = (() => {
    let ac = null, maitre = null, musique = null, coupe = !!lireLS("aetheria_duel_muet", false), voixOk = true;
    const init = () => { if (ac) return ac; try { ac = new (window.AudioContext || window.webkitAudioContext)(); maitre = ac.createGain(); maitre.gain.value = 0.5; maitre.connect(ac.destination); } catch (e) { ac = null; } return ac; };
    const bruit = (duree) => { const n = Math.max(1, Math.floor(ac.sampleRate * duree)), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = ac.createBufferSource(); s.buffer = b; return s; };
    const env = (g, t, a, d, v) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    function jouer(nom, force = 1) {
      if (coupe || !init()) return;
      try {
        if (ac.state === "suspended") ac.resume();
        const t = ac.currentTime, g = ac.createGain(); g.connect(maitre);
        const osc = (type, f1, f2, duree, v) => { const o = ac.createOscillator(), go = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + duree); o.connect(go); go.connect(maitre); env(go, t, 0.005, duree, v); o.start(t); o.stop(t + duree + 0.05); };
        const souffle = (freq, q, duree, v) => { const s = bruit(duree), f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q; s.connect(f); f.connect(g); env(g, t, 0.004, duree, v); s.start(t); };
        switch (nom) {
          case "coup": souffle(1800, 1.2, 0.09, 0.55 * force); osc("square", 180, 60, 0.08, 0.15); break;
          case "fort": souffle(800, 0.9, 0.2, 0.8 * force); osc("sawtooth", 150, 40, 0.18, 0.25); break;
          case "garde": souffle(3200, 4, 0.08, 0.35); osc("triangle", 900, 700, 0.07, 0.12); break;
          case "saut": osc("sine", 280, 520, 0.12, 0.1); break;
          case "dash": souffle(2600, 0.7, 0.15, 0.25); break;
          case "magie": osc("sawtooth", 220, 880, 0.35, 0.14); souffle(1500, 1, 0.3, 0.12); break;
          case "signature": osc("sawtooth", 160, 1400, 0.5, 0.2); souffle(900, 0.6, 0.5, 0.25); break;
          case "super": osc("sawtooth", 110, 1200, 0.9, 0.28); souffle(600, 0.5, 0.9, 0.25); break;
          case "ko": osc("sawtooth", 220, 30, 1.2, 0.4); souffle(300, 0.4, 1.2, 0.45); break;
          case "combo": osc("square", 600 + force * 60, 900 + force * 80, 0.09, 0.08); break;
          case "tag": osc("triangle", 500, 1000, 0.15, 0.15); break;
          case "ding": osc("triangle", 1320, 1320, 0.45, 0.2); break;
        }
      } catch (e) {}
    }
    function voix(txt) {
      if (coupe || !voixOk || !window.speechSynthesis) return;
      try { const u = new SpeechSynthesisUtterance(txt); u.lang = "fr-FR"; u.rate = 0.95; u.pitch = 0.55; u.volume = 1; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { voixOk = false; }
    }
    // musique : une boucle par arène (basse, arpège, percussions)
    const GAMMES = { cathedrale: [0, 3, 7, 10, 12], foret: [0, 2, 3, 7, 10], celeste: [0, 4, 7, 11, 14], abysses: [0, 3, 5, 10, 12], enfers: [0, 1, 5, 7, 8], neige: [0, 2, 7, 9, 14], trone: [0, 3, 7, 8, 12] };
    const BASES = { cathedrale: 110, foret: 98, celeste: 131, abysses: 87, enfers: 82, neige: 117, trone: 104 };
    function lancerMusique(arene) {
      arreterMusique();
      if (coupe || !init()) return;
      try {
        if (ac.state === "suspended") ac.resume();
        const gm = ac.createGain(); gm.gain.value = 0.15; gm.connect(maitre);
        const gamme = GAMMES[arene] || GAMMES.cathedrale, base = BASES[arene] || 110, tempo = arene === "enfers" ? 0.15 : arene === "celeste" || arene === "neige" ? 0.23 : 0.19;
        let pas = 0, prochain = ac.currentTime + 0.15;
        const note = (f, t, duree, type, v) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; o.connect(g); g.connect(gm); env(g, t, 0.01, duree, v); o.start(t); o.stop(t + duree + 0.05); };
        const tambour = (t, grave) => { const s = bruit(0.12), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = grave ? "lowpass" : "highpass"; f.frequency.value = grave ? 140 : 6000; s.connect(f); f.connect(g); g.connect(gm); env(g, t, 0.002, grave ? 0.12 : 0.04, grave ? 1 : 0.22); s.start(t); };
        const progression = [0, 0, 3, 2];
        const minuteur = setInterval(() => {
          try {
            while (prochain < ac.currentTime + 0.3) {
              const deg = progression[Math.floor(pas / 16) % 4], t = prochain;
              const f0 = base * Math.pow(2, gamme[deg % gamme.length] / 12);
              if (pas % 4 === 0) note(f0 / 2, t, tempo * 3.6, "triangle", 0.55);
              note(f0 * 2 * Math.pow(2, gamme[(pas * 3 + deg) % gamme.length] / 12), t, tempo * 0.9, "square", 0.05);
              if (pas % 8 === 0 || (arene === "enfers" && pas % 4 === 2)) tambour(t, true);
              if (pas % 2 === 1) tambour(t, false);
              pas++; prochain += tempo;
            }
          } catch (e) {}
        }, 80);
        musique = { gm, minuteur };
      } catch (e) {}
    }
    function arreterMusique() { if (!musique) return; clearInterval(musique.minuteur); const g = musique.gm; try { g.gain.setTargetAtTime(0, ac.currentTime, 0.15); } catch (e) {} setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 800); musique = null; }
    return {
      jouer, voix, lancerMusique, arreterMusique, init,
      get coupe() { return coupe; },
      basculer(arene) { coupe = !coupe; ecrireLS("aetheria_duel_muet", coupe); if (coupe) { arreterMusique(); if (window.speechSynthesis) speechSynthesis.cancel(); } else lancerMusique(arene); return coupe; },
    };
  })();

  // ---- coups signature (↓ ↘ → + Spécial) ----
  const SIGNATURES = {
    eventail: ["Éventail de cartes", "3 projectiles en éventail"], teleport: ["Pas de l'ombre", "se téléporte derrière l'adversaire et frappe"],
    vague: ["Lame de fond", "une vague rase le sol (à sauter)"], pluie: ["Pluie céleste", "des projectiles tombent du ciel sur l'adversaire"],
    colonne: ["Pilier infernal", "un pilier jaillit sous l'adversaire"], charge: ["Charge foudroyante", "fonce à travers l'écran"],
  };
  function signatureDe(app, element) {
    if (app && app.sig && SIGNATURES[app.sig]) return app.sig;
    if (app && app.arme === "cartes") return "eventail";
    return { sang: "teleport", ombre: "teleport", eau: "vague", glace: "vague", nature: "vague", poison: "vague", lumiere: "pluie", foudre: "pluie", arcane: "pluie", vent: "charge", feu: "colonne", terre: "colonne" }[element] || "charge";
  }

  /* =====================================================================
     DUEL — jeu de combat façon Street Fighter
     ===================================================================== */
  const COULEURS_MOTS = [
    [/argent|blanc|platine|neige/, "#e6e4ee"], [/gris|cendre/, "#9a98a4"], [/noir|ebene|corbeau/, "#17121c"], [/roux|cuivr|orange/, "#c4501c"],
    [/rouge|ecarlate|sang|carmin|pourpre/, "#a81024"], [/blond|dore|or\b/, "#e6c46c"], [/brun|chatain|marron/, "#5a3a24"], [/bleu|azur|saphir/, "#2a4ab4"],
    [/violet|mauve|lilas|amethyste/, "#6a2aa4"], [/vert|emeraude/, "#2a7a44"], [/rose/, "#e07aa4"],
  ];
  const couleurDe = (mot) => { const m = normal(mot || ""); const c = COULEURS_MOTS.find(([re]) => re.test(m)); return c ? c[1] : null; };
  function apparenceAuto(f) {
    const t = normal(`${f.resume || ""} ${(f.infos || []).map((i) => `${i.cle} ${i.valeur}`).join(" ")}`);
    const race = normal((raceDuPerso(f) || {}).nom || infoPerso(f, /race|peuple|espece/));
    const h = hachage(f.id), el = elementDeFiche(f), E = ELEMENTS[el] || ELEMENTS.physique;
    const genre = normal(infoPerso(f, /sexe|genre/));
    const femme = /^f|femme|fille/.test(genre) || (!genre && (t.match(/\belle\b/g) || []).length > (t.match(/\bil\b/g) || []).length);
    const cheveuxMot = (t.match(/cheveux\s+(?:longs\s+|courts\s+)?(\w+)/) || [])[1];
    const yeuxMot = (t.match(/yeux\s+(\w+)/) || [])[1];
    const a = {
      femme, peau: ["#f2dcc8", "#e8c4a4", "#c89470", "#8a5a3c", "#f4e4e0"][h % 5],
      cheveux: couleurDe(cheveuxMot) || ["#17121c", "#e6e4ee", "#5a3a24", "#a81024", "#e6c46c", "#2a2a3a"][h % 6],
      longueur: /longs|longue/.test(t) ? 3 : /courts|rase/.test(t) ? 0 : femme ? 2 + (h % 2) : h % 3,
      coiffure: ["lisse", "ebouriffe", "lisse"][(h >> 3) % 3], yeux: couleurDe(yeuxMot) || ["#5a3a24", "#2a6ab0", "#3a8a4a", "#7a5a9a"][(h >> 4) % 4],
      haut: teinteSombre(E.c2, 0.45), manteau: (h >> 5) % 3 ? "#17121a" : teinteSombre(E.c2, 0.3), manteauLong: true, doublure: (h >> 6) % 2 ? "#c8a050" : E.c1,
      pantalon: "#17121a", bottes: "#0e0a0c", ceinture: "#2a1a14", aura: E.glow, mainMagique: el !== "physique",
    };
    if (/vampir/.test(race + t)) Object.assign(a, { crocs: true, yeux: "#d01020", yeuxBrillants: true, peau: "#f4e4e4", doublure: "#a01020" });
    if (/demon|diable/.test(race)) Object.assign(a, { cornes: "belier", queue: "#2a0a10", yeux: "#ff2030", yeuxBrillants: true });
    if (/peche/.test(race)) Object.assign(a, { ailes: "chauve" });
    if (/oni/.test(race)) Object.assign(a, { cornes: "oni" });
    if (/ange|archange|celest/.test(race)) Object.assign(a, { ailes: "plumes", aureole: !/dechu/.test(race), ailesNb: /archange/.test(race) ? 6 : 2 });
    if (/dechu/.test(race)) Object.assign(a, { couleurAiles: "#17121a", veinesAiles: "#d01020", aureole: false });
    if (/elfe/.test(race)) Object.assign(a, { oreilles: "pointues" });
    if (/elfe noir/.test(race)) Object.assign(a, { peau: "#8a6a7a" });
    if (/elfe aile/.test(race)) Object.assign(a, { ailes: "plumes", couleurAiles: "#e8fff4" });
    if (/siren/.test(race)) Object.assign(a, { oreilles: "nageoire", nageoire: "#5ab0e0", aura: "#5ad0ff" });
    if (/bete|hybride|chat|loup|garou/.test(race + " " + t)) Object.assign(a, { chat: true });
    if (/dieu/.test(race)) Object.assign(a, { aureole: true, couronne: "#e6c46c", aura: "#ffe58a" });
    if (/roi|reine|prince|princesse|empereur|imperatrice|souverain/.test(t)) Object.assign(a, { couronne: a.couronne || "#c8a050" });
    const comp = competencesLocales(f);
    a.arme = /\bcarte/.test(t) ? "cartes" : /faux\b/.test(t) ? "faux" : /trident/.test(t) ? "trident" : /lance\b/.test(t) ? "lance" : /livre|grimoire/.test(t) ? "livre" : /canne/.test(t) ? "canne"
      : comp.role === "soutien" ? "baton" : comp.role === "defenseur" ? "epee" : el === "sang" ? "epee_sang" : (h >> 7) % 2 ? "epee" : null;
    if (comp.role === "defenseur") a.armure = "#8a8aa0";
    return a;
  }
  function teinteSombre(c, f) { const m = /^#?([0-9a-f]{6})$/i.exec(c || ""); if (!m) return c; const n = parseInt(m[1], 16); const t = (v) => Math.round(v * f).toString(16).padStart(2, "0"); return "#" + t((n >> 16) & 255) + t((n >> 8) & 255) + t(n & 255); }

  // ---- planche de poses (image d'une IA) : découpage automatique ----
  const NOMS_POSES = ["garde", "marche", "poing", "pied", "magie", "touche", "finish"];
  const planches = new Map();
  function chargerPlanche(url) {
    if (!url) return Promise.resolve(null);
    if (planches.has(url)) return planches.get(url);
    const p = new Promise((ok) => {
      const essai = (cors) => {
        const im = new Image();
        if (cors) im.crossOrigin = "anonymous";
        im.onload = () => { try { ok(decouperPlanche(im)); } catch (e) { console.warn(e); ok(null); } };
        im.onerror = () => (cors ? essai(false) : ok(null));
        im.src = url;
      };
      essai(true);
    });
    planches.set(url, p);
    return p;
  }
  function decouperPlanche(img) {
    const k = Math.min(1, 420 / img.naturalHeight), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, w, h);
    const id = cx.getImageData(0, 0, w, h), d = id.data;
    // fond : couleur des coins, effacée par remplissage depuis les bords
    const coin = [0, 1, 2].map((c) => Math.round((d[c] + d[(w - 1) * 4 + c] + d[(h - 1) * w * 4 + c] + d[((h - 1) * w + w - 1) * 4 + c]) / 4));
    const vu = new Uint8Array(w * h), pile = [];
    for (let x = 0; x < w; x++) pile.push(x, 0, x, h - 1);
    for (let y = 0; y < h; y++) pile.push(0, y, w - 1, y);
    while (pile.length) {
      const y = pile.pop(), x = pile.pop(); if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x; if (vu[i]) continue;
      const p = i * 4; if (d[p + 3] > 20 && Math.abs(d[p] - coin[0]) + Math.abs(d[p + 1] - coin[1]) + Math.abs(d[p + 2] - coin[2]) > 60) continue;
      vu[i] = 1; d[p + 3] = 0; pile.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    cx.putImageData(id, 0, 0);
    // colonnes occupées → une pose par bloc
    const plein = new Array(w).fill(0);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y += 2) if (d[(y * w + x) * 4 + 3] > 40) plein[x]++;
    let blocs = [], debut = -1;
    for (let x = 0; x <= w; x++) { const o = x < w && plein[x] > 1; if (o && debut < 0) debut = x; if (!o && debut >= 0) { blocs.push([debut, x - 1]); debut = -1; } }
    blocs = blocs.filter(([a, b]) => b - a > w / 60);
    // fusionner les morceaux trop proches (une épée détachée…)
    for (let i = 0; i < blocs.length - 1; i++) if (blocs[i + 1][0] - blocs[i][1] < w / 80) { blocs[i] = [blocs[i][0], blocs[i + 1][1]]; blocs.splice(i + 1, 1); i--; }
    if (blocs.length < 5 || blocs.length > 8) { const n = blocs.length > 8 ? 7 : 6; blocs = Array.from({ length: n }, (_, i) => [Math.round((i * w) / n), Math.round(((i + 1) * w) / n) - 1]); }
    const poses = {};
    blocs.slice(0, 7).forEach(([x0, x1], i) => {
      let y0 = h, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x += 2) if (d[(y * w + x) * 4 + 3] > 40) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (y1 <= y0) return;
      const c = document.createElement("canvas"); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
      c.getContext("2d").drawImage(cv, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
      const b = document.createElement("canvas"); b.width = c.width; b.height = c.height;
      const bx = b.getContext("2d"); bx.drawImage(c, 0, 0); bx.globalCompositeOperation = "source-in"; bx.fillStyle = "#fff"; bx.fillRect(0, 0, b.width, b.height);
      poses[NOMS_POSES[i]] = { img: c, blanc: b };
    });
    if (!poses.garde) return null;
    for (const n of NOMS_POSES) if (!poses[n]) poses[n] = poses[n === "finish" ? "magie" : "garde"] || poses.garde;
    return poses;
  }

  // ---- données d'un combattant ----
  // thème du coup de grâce : la magie du perso (sceaux, cartes…) sinon son élément
  const THEMES_KITS = ["sceaux", "cartes", "metamorphose", "illusion", "temps", "gravite", "invocation", "necro", "telekinesie", "son", "espace", "mots"];
  const MOTS_FINISH = [
    ["foudre", ["foudr", "eclair", "tonnerr", "electr", "orage", "fulgur", "surtension", "tension", "volt", "courant", "statique", "plasma", "thunder", "lightning", "spark", "storm", "raijin", "zeus"]],
    ["feu", ["feu\\b", "feux", "flamm", "brul", "braise", "incend", "ignis", "pyro", "magma", "lave\\b", "fire", "flame", "blaze", "inferno", "burn", "ember", "solaire"]],
    ["glace", ["glac", "gel\\b", "givr", "neige", "cryo", "froid", "blizzard", "ice\\b", "frost", "freez", "snow"]],
    ["sang", ["sang", "hemo", "vampir", "saign", "blood", "bleed"]],
    ["eau", ["eau\\b", "eaux\\b", "vague", "maree", "ocean", "aqua", "torrent", "water", "tide", "tsunami"]],
    ["vent", ["vent\\b", "vents\\b", "tornade", "tempete", "ouragan", "bourrasque", "wind", "gale", "tornado", "cyclone"]],
    ["terre", ["terre", "roche", "pierre", "seism", "rock", "stone", "earth", "quake", "sable"]],
    ["poison", ["poison", "venin", "toxi", "acide", "venom"]],
    ["nature", ["ronce", "liane", "vegetal", "racine", "epine", "thorn", "vine", "root"]],
    ["ombre", ["ombre", "tenebr", "neant", "obscur", "shadow", "dark", "void", "abyss"]],
    ["lumiere", ["lumi", "sacre", "divin", "celest", "saint", "holy", "light\\b", "radian", "jugement"]],
  ].map(([el, l]) => [el, motsDebut(l)]);
  const COULEURS_FINISH = [
    [["rouge", "red\\b", "ecarlate", "cramois", "carmin", "vermeil", "rubis", "crimson", "scarlet"], "#ff2a2a"],
    [["bleu", "blue", "azur", "saphir", "cyan"], "#3a8aff"],
    [["violet", "purple", "mauve", "pourpre", "amethyst"], "#a04aff"],
    [["vert\\b", "verte", "green", "emeraude", "jade"], "#3aff6a"],
    [["or\\b", "dore", "gold", "jaune", "yellow"], "#ffd23a"],
    [["noir", "black"], "#5a2aa0"],
    [["blanc", "white", "argent", "silver"], "#ffffff"],
    [["rose\\b", "pink"], "#ff6ad0"],
    [["orange"], "#ff8a1a"],
  ].map(([l, c]) => [motsDebut(l), c]);
  // palette complète à partir d'une couleur
  function paletteDe(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null;
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const mix = (k, v) => "#" + [r, g, b].map((x) => Math.round(x + (v - x) * k).toString(16).padStart(2, "0")).join("");
    return { c1: mix(0.45, 255), c2: mix(0.55, 0), glow: "#" + m[1], nom: "finish" };
  }
  function themeFinishDe(f, ulti, el, nomPerso) {
    const tu = normal(`${nomPerso || ""} ${ulti ? `${ulti.nom} ${ulti.description || ""}` : ""}`);
    const iu = KITS_MAGIE.findIndex((k) => k.re.test(tu)); if (iu >= 0 && THEMES_KITS[iu]) return THEMES_KITS[iu];
    const mu = MOTS_FINISH.find(([, re]) => re.test(tu)); if (mu) return mu[0];
    if (ulti && ulti.element && ulti.element !== "physique" && ELEMENTS[ulti.element]) return ulti.element;
    const t = normal(`${magieDe(f) || ""} ${(f.infos || []).filter((i) => /magie|pouvoir|capacit|\bdon\b|aptitude/.test(normal(i.cle))).map((i) => i.valeur).join(" ")}`);
    const i = KITS_MAGIE.findIndex((k) => k.re.test(t));
    return i >= 0 && THEMES_KITS[i] ? THEMES_KITS[i] : el;
  }
  const nomOption = (n) => String(n || "").replace(/:/g, " ").trim();
  // rôle de chaque compétence dans le Duel (Spécial, Super)
  const specialDe = (comp) => comp.find((c) => c.type === "degats" && c !== comp[0]) || comp[1] || null;
  const superDe = (comp) => comp.find((c) => c.cible === "tous_ennemis") || comp[2] || null;
  // compétence du coup de grâce : celle choisie dans l'éditeur ; sinon celle qui porte le nom tapé ;
  // sinon la plus forte qui n'est ni l'attaque de base, ni le Spécial
  function ultiDe(comp, app, nomPerso) {
    const choisie = app && app.finComp && comp.find((c) => nomOption(c.nom) === app.finComp);
    if (choisie) return choisie;
    if (nomPerso && nomPerso.trim()) return comp.find((c) => normal(c.nom) === normal(nomPerso)) || null;
    const avec = comp.map((c, i) => ({ c, i })), sp = specialDe(comp);
    const essais = [avec.filter(({ c }) => c !== comp[0] && c !== sp), avec];
    const l = essais.find((e) => e.length) || [];
    const off = l.filter(({ c }) => ["degats", "etourdir", "affaiblir"].includes(c.type)), liste = off.length ? off : l;
    liste.sort((a, b) => (b.c.puissance || 0) - (a.c.puissance || 0) || (b.c.recharge || 0) - (a.c.recharge || 0) || (b.c.cible === "tous_ennemis") - (a.c.cible === "tous_ennemis") || b.i - a.i);
    return liste.length ? liste[0].c : null;
  }
  function couleurFinishDe(ulti, nomPerso) {
    if (!ulti && !nomPerso) return null;
    for (const txt of [normal(nomPerso || ""), normal(ulti ? ulti.nom : ""), normal(ulti ? ulti.description || "" : "")]) { const c = COULEURS_FINISH.find(([re]) => re.test(txt)); if (c) return c[1]; }
    return null;
  }
  async function combattantDe(f, duelData, rpData) {
    const dd = duelData.find((d) => d.fiche_id === f.id) || {};
    const auto = apparenceAuto(f), ia = dd.apparence || {};
    const app = Object.keys(ia).length ? { ...auto, cornes: undefined, ailes: undefined, aureole: undefined, chat: undefined, crocs: undefined, oreilles: undefined, couronne: undefined, queue: undefined, armure: undefined, arme: undefined, ...ia } : auto;
    const comp = (rpData.find((p) => p.fiche_id === f.id) || competencesLocales(f)).competences || [];
    const el = (comp.find((c) => c.element && c.element !== "physique") || {}).element || elementDeFiche(f);
    const x = forces(f);
    const ulti = ultiDe(comp, app, dd.finish_nom);
    return {
      f, nom: f.titre, app, ulti: ulti ? { nom: ulti.nom, description: ulti.description || "", element: ulti.element } : null, theme: app.finTheme || themeFinishDe(f, ulti, ELEMENTS[el] ? el : "physique", dd.finish_nom),
      palFinish: paletteDe(app.finCouleur) || paletteDe(couleurFinishDe(ulti, dd.finish_nom)), element: ELEMENTS[el] ? el : "physique", stats: x,
      special: (specialDe(comp) || { nom: "Attaque spéciale" }).nom,
      super: (superDe(comp) || { nom: "Super" }).nom,
      finish: dd.finish_nom || "", planche: await chargerPlanche(dd.planche_url), planche_url: dd.planche_url || null,
      sig: signatureDe(app, ELEMENTS[el] ? el : "physique"),
      sigNom: (app.sigNom || "").trim() || (comp.find((c) => c.type === "degats" && c.puissance >= 3) || {}).nom || SIGNATURES[signatureDe(app, ELEMENTS[el] ? el : "physique")][0],
    };
  }

  // ---- moteur ----
  const W_D = 640, H_D = 360, SOL = 318;
  const COUPS = {
    // stun = paralysie à l'impact, bstun = paralysie en garde (à la Street Fighter : léger avantage si ça touche, les gros coups sont punissables en garde)
    coup: { debut: 4, actif: 3, fin: 9, dmg: 44, portee: 74, stun: 14, bstun: 12, recul: 3, gain: 7, pose: "poing" },
    fort: { debut: 10, actif: 5, fin: 17, dmg: 92, portee: 90, stun: 24, bstun: 16, recul: 8, gain: 12, pose: "pied", secousse: 5 },
    bas: { debut: 5, actif: 3, fin: 10, dmg: 36, portee: 76, stun: 15, bstun: 12, recul: 3, gain: 6, pose: "balayage", bas: true },
    balayage: { debut: 9, actif: 5, fin: 20, dmg: 68, portee: 96, stun: 0, bstun: 13, recul: 6, gain: 11, pose: "balayage", bas: true, chute: true },
    aerien: { debut: 4, actif: 12, fin: 2, dmg: 64, portee: 70, stun: 18, bstun: 14, recul: 5, gain: 9, pose: "aerien", haut: true },
    lanceur: { debut: 7, actif: 6, fin: 20, dmg: 74, portee: 78, stun: 0, bstun: 12, recul: 2, gain: 12, pose: "uppercut", lance: true, antiair: true },
  };
  function creerCombattant(c, cote) {
    const x = c.stats;
    return {
      c, x: cote === 0 ? 180 : 460, y: SOL, vx: 0, vy: 0, face: cote === 0 ? 1 : -1, cote,
      pvMax: Math.round(1000 + x.defense * 9 + x.soutien * 4), pv: 0, pvAff: 0, super: 0,
      attMul: 1 + x.attaque / 55, defRed: Math.min(0.32, x.defense / 110), vitesse: 1 + Math.min(0.25, x.soutien / 120),
      etat: "garde", t: 0, coup: null, touche: false, stun: 0, invuln: 0, blanc: 0, recharge: 0, sigRecharge: 0, gagnes: 0, phase: Math.random() * 6,
      hist: [], tapsAvant: [], combo: 0, comboDmg: 0, comboAff: 0, comboT: 0, tagCd: 0,
    };
  }

  pages.jeux.duel = () => enTete("🥊", "Duel", "Choisis ton combattant et affronte l'ordinateur, un ami sur le même clavier… ou en ligne avec un lien.") + `<div id="duel-zone"><p class="discret">Chargement…</p></div>`;
  pages.jeux.duel.apres = async () => {
    const z = $("#duel-zone");
    const persos = persosJeu();
    if (persos.length < 2) { z.innerHTML = `<p class="note">Il faut au moins deux fiches de personnage.</p>`; return; }
    const [duelData, rpData] = await Promise.all([api.duelPersos().catch(() => []), api.rpgPersos().catch(() => [])]);
    const params = new URLSearchParams((location.hash.split("?")[1] || ""));
    const codeSalle = params.get("salle");
    const lieux = [...indexParId.values()].filter((f) => f.categorie === "monde").sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
    let choix = { arene: lireLS("aetheria_duel_arene", "hasard"), p1: lireLS("aetheria_duel_p1", null), p2: lireLS("aetheria_duel_p2", null), p1b: lireLS("aetheria_duel_p1b", null), p2b: lireLS("aetheria_duel_p2b", null), mode: lireLS("aetheria_duel_mode", "ordi"), niveau: lireLS("aetheria_duel_niveau", "normal"), duo: !!lireLS("aetheria_duel_duo", false), mannequin: lireLS("aetheria_duel_mannequin", "immobile") };
    if (!persos.some((f) => f.id === choix.p1)) choix.p1 = persos[0].id;
    if (!persos.some((f) => f.id === choix.p2)) choix.p2 = persos[persos.length > 1 ? 1 : 0].id;
    if (!persos.some((f) => f.id === choix.p1b)) choix.p1b = persos[Math.min(2, persos.length - 1)].id;
    if (!persos.some((f) => f.id === choix.p2b)) choix.p2b = persos[Math.min(3, persos.length - 1)].id;
    const duoPossible = () => ["ordi", "deux", "ligne"].includes(choix.mode);
    let partie = null, salle = null;

    /* ----- écran de sélection ----- */
    const apercu = (f, cote) => {
      const cv = document.createElement("canvas"); cv.width = 180; cv.height = 210; cv.className = "apercu-duel";
      combattantDe(f, duelData, rpData).then((c) => {
        const ctx = cv.getContext("2d"); let t0 = performance.now();
        const anim = () => {
          if (!document.body.contains(cv)) return;
          const t = (performance.now() - t0) / 1000; ctx.clearRect(0, 0, 180, 210);
          ctx.save(); ctx.translate(90, 196); ctx.scale(cote ? -1.05 : 1.05, 1.05);
          ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(0, 0, 32, 6, 0, 0, 7); ctx.fill();
          if (c.planche) { const p = c.planche.garde, hh = 170, ww = (hh * p.img.width) / p.img.height; ctx.drawImage(p.img, -ww / 2, -hh + Math.sin(t * 2.2) * 1.5, ww, hh); }
          else { const pose = Object.assign({}, COMBATTANT.POSES.garde); pose.hy = Math.sin(t * 2.2) * 1.2; COMBATTANT.dessiner(ctx, c.app, pose, t); }
          ctx.restore(); requestAnimationFrame(anim);
        };
        anim();
      });
      return cv;
    };
    const ecranChoix = () => {
      if (partie) partie.arreter(); partie = null;
      const f1 = indexParId.get(choix.p1), f2 = indexParId.get(choix.p2);
      const enLigneOk = api.enLigne && estMembre();
      const duo = choix.duo && duoPossible() && choix.mode !== "ligne";
      z.innerHTML = `
        <div class="duel-choix">
          <div class="modes onglets-roue modes-duel">
            ${[["ordi", "🤖 Contre l'ordi"], ["arcade", "🕹️ Arcade"], ["deux", "👥 2 joueurs"], ["ligne", "🌐 En ligne"], ["entrainement", "🎯 Entraînement"]].map(([m, n]) => `<button class="mode ${choix.mode === m ? "actif" : ""}" data-mode="${m}" ${m === "ligne" && !enLigneOk ? "disabled" : ""}>${n}</button>`).join("")}
          </div>
          <div class="duel-vs">
            <div class="dc-cote"><div class="dc-label">${choix.mode === "deux" ? "Joueur 1" : "Toi"}</div><div class="dc-paire"><div id="ap1"></div>${duo ? `<div id="ap1b" class="ap-partenaire"></div>` : ""}</div><div class="dc-nom">${esc(f1.titre)}${duo ? ` <small>&amp; ${esc(indexParId.get(choix.p1b).titre)}</small>` : ""}</div><div class="rangee centre"><button class="btn petit" data-changer="p1">Changer</button>${duo ? `<button class="btn petit" data-changer="p1b">Partenaire</button>` : ""}</div></div>
            <div class="dc-vs-mot">VS</div>
            <div class="dc-cote"><div class="dc-label">${{ deux: "Joueur 2", ligne: "Ton ami", arcade: "6 adversaires", entrainement: "Mannequin" }[choix.mode] || "Ordinateur"}</div>${choix.mode === "ligne" ? `<div class="dc-mystere">?</div><div class="dc-nom">Il choisira</div>` : choix.mode === "arcade" ? `<div class="dc-mystere">⚔️</div><div class="dc-nom">De plus en plus forts… jusqu'au boss</div>` : `<div class="dc-paire"><div id="ap2"></div>${duo ? `<div id="ap2b" class="ap-partenaire"></div>` : ""}</div><div class="dc-nom">${esc(f2.titre)}${duo ? ` <small>&amp; ${esc(indexParId.get(choix.p2b).titre)}</small>` : ""}</div><div class="rangee centre"><button class="btn petit" data-changer="p2">Changer</button>${duo ? `<button class="btn petit" data-changer="p2b">Partenaire</button>` : ""}</div>`}</div>
          </div>
          ${duoPossible() ? `<label class="ea-ligne duo-case"><input type="checkbox" id="duel-duo" ${choix.duo ? "checked" : ""}> 👥 Duo : 2 contre 2 avec relais (touche U / bouton ⇄)</label>` : ""}
          ${choix.mode === "entrainement" ? `<label class="champ-court centre">Mannequin<select id="duel-mannequin"><option value="immobile" ${choix.mannequin === "immobile" ? "selected" : ""}>Immobile</option><option value="garde" ${choix.mannequin === "garde" ? "selected" : ""}>Se protège</option></select></label>` : ""}
          <label class="champ-court centre">🗺️ Arène<select id="duel-arene">
            <option value="hasard" ${choix.arene === "hasard" ? "selected" : ""}>🎲 Au hasard</option>
            ${Object.entries(ARENES).map(([k, a]) => `<option value="${k}" ${choix.arene === k ? "selected" : ""}>${a.ic} ${esc(a.nom)}</option>`).join("")}
            ${lieux.length ? `<optgroup label="Lieux du wiki">${lieux.map((f) => `<option value="lieu:${esc(f.id)}" ${choix.arene === "lieu:" + f.id ? "selected" : ""}>📍 ${esc(f.titre)}</option>`).join("")}</optgroup>` : ""}
          </select></label>
          ${choix.mode === "ordi" ? `<div class="rangee centre">${[["facile", "Facile"], ["normal", "Normal"], ["difficile", "Difficile"]].map(([n, l]) => `<button class="btn petit ${choix.niveau === n ? "btn-or" : ""}" data-niveau="${n}">${l}</button>`).join("")}</div>` : ""}
          ${choix.mode === "deux" ? `<p class="discret petit-texte centre">J1 : Z/Q/S/D (ou W/A) + F coup, G fort, H spécial, T super, R signature, Y relais — J2 : flèches + 1 coup, 2 fort, 3 spécial, 0 super, 4 signature, 5 relais.</p>` : ""}
          <div class="rangee centre"><button class="btn btn-or large" id="duel-go">${{ ligne: "🌐 Créer le défi", arcade: "🕹️ Commencer l'Arcade", entrainement: "🎯 S'entraîner" }[choix.mode] || "⚔️ Combattre"}</button><button class="btn petit" id="duel-classement">🏅 Classement</button></div>
          <div id="duel-classement-zone"></div>
          <div id="duel-liste"></div>
          ${estMembre() ? `<details class="duel-reglages"><summary>🎨 Apparence de ${esc(f1.titre)} dans le jeu</summary><div id="duel-apparence"></div></details>` : ""}
          <details class="duel-aide"><summary>🎮 Commandes et combos</summary><ul class="petit-texte">
            <li><b>Ordi</b> : flèches ou ZQSD pour bouger · J coup · K fort · L spécial · I super · O signature · U relais (duo). <b>Téléphone</b> : mets-toi à l'horizontale, le combat passe en grand écran. À gauche, la croix : garde le pouce dessus et glisse-le (les diagonales marchent, ↓ ↘ → aussi). À droite : Coup et Fort en gros, Spé / Super / ★ au-dessus.</li>
            <li><b>Garde</b> : recule (accroupi pour les coups bas ; les coups sautés se parent debout). <b>Ruée</b> : avant, avant.</li>
            <li><b>Projection</b> : collé à l'adversaire, avant (ou arrière) + Coup. Elle passe la garde : parfait contre quelqu'un qui ne fait que se protéger. Si les deux projettent en même temps : dégagement.</li>
            <li><b>Lanceur</b> : avant + Fort (uppercut, aussi anti-aérien). <b>Balayage</b> : bas + Fort, fait tomber.</li>
            <li><b>Attention</b> : un coup raté ou paré te laisse ouvert un instant. Marteler les boutons se fait punir.</li>
            <li><b>Combo</b> : Coup → Coup → Fort → Spécial, en enchaînant pendant que ça touche. Plus le combo est long, plus le compteur monte (les dégâts baissent un peu à chaque coup).</li>
            <li><b>Signature</b> : ↓ ↘ → + Spécial (ou O / bouton ★). Chaque personnage a la sienne : éventail de cartes, téléportation, vague, pluie céleste, pilier, charge…</li>
            <li><b>Coup de grâce</b> : quand l'adversaire est sonné à la fin, appuie sur Super.</li></ul></details>
        </div>`;
      $("#ap1").appendChild(apercu(f1, 0));
      if ($("#ap2")) $("#ap2").appendChild(apercu(f2, 1));
      if ($("#ap1b")) $("#ap1b").appendChild(apercu(indexParId.get(choix.p1b), 0));
      if ($("#ap2b")) $("#ap2b").appendChild(apercu(indexParId.get(choix.p2b), 1));
      const dc = $("#duel-duo"); if (dc) dc.onchange = () => { choix.duo = dc.checked; ecrireLS("aetheria_duel_duo", choix.duo); ecranChoix(); };
      const mq = $("#duel-mannequin"); if (mq) mq.onchange = () => { choix.mannequin = mq.value; ecrireLS("aetheria_duel_mannequin", choix.mannequin); };
      $("#duel-classement").onclick = () => afficherClassement($("#duel-classement-zone"));
      $("#duel-arene").onchange = (e) => { choix.arene = e.target.value; ecrireLS("aetheria_duel_arene", choix.arene); };
      $$("[data-mode]", z).forEach((b) => (b.onclick = () => { choix.mode = b.dataset.mode; ecrireLS("aetheria_duel_mode", choix.mode); ecranChoix(); }));
      $$("[data-niveau]", z).forEach((b) => (b.onclick = () => { choix.niveau = b.dataset.niveau; ecrireLS("aetheria_duel_niveau", choix.niveau); ecranChoix(); }));
      $$("[data-changer]", z).forEach((b) => (b.onclick = () => liste(b.dataset.changer)));
      $("#duel-go").onclick = () => { SON.init(); if (choix.mode === "ligne") creerSalle(); else if (choix.mode === "arcade") arcadeDebut(); else lancer(); };
      if ($("#duel-apparence")) editeurApparence($("#duel-apparence"), f1);
    };
    const liste = (qui) => {
      const zl = $("#duel-liste");
      zl.innerHTML = `<div class="grille-duel">${persos.map((f) => `<button class="perso-duel ${choix[qui] === f.id ? "actif" : ""}" data-p="${esc(f.id)}">${vignette(f)}<span>${esc(f.titre)}</span></button>`).join("")}</div>`;
      $$("[data-p]", zl).forEach((b) => (b.onclick = () => { choix[qui] = b.dataset.p; ecrireLS("aetheria_duel_" + qui, choix[qui]); ecranChoix(); }));
      zl.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    /* ----- éditeur d'apparence (auteur de la fiche ou admin) ----- */
    const editeurApparence = (zone, f) => {
      const dd = duelData.find((d) => d.fiche_id === f.id) || {};
      const peut = peutModifier(f);
      zone.innerHTML = `
        <p class="discret petit-texte">${dd.planche_url ? "✅ Ce personnage a une planche de poses." : "Sans planche, le jeu dessine le personnage d'après sa fiche."} ${dd.apparence && Object.keys(dd.apparence).length ? "Apparence enregistrée." : "Apparence devinée automatiquement."}</p>
        ${peut ? `<div class="rangee">
          <button class="btn petit btn-or" id="app-ia">🤖 L'IA regarde son image et règle son apparence</button>
          <label class="btn petit">🖼️ Envoyer une planche de poses<input type="file" accept="image/*" id="app-planche" hidden></label>
          ${dd.planche_url ? `<button class="btn petit btn-danger" id="app-sans-planche">Retirer la planche</button>` : ""}
        </div>
        <label class="champ-court">Nom du coup de grâce<input id="app-finish" maxlength="40" value="${esc(dd.finish_nom || "")}" placeholder="ex : Danse des cartes funèbres"></label>
        <button class="btn petit" id="app-finish-ok">Enregistrer le nom</button>
        <details><summary class="petit-texte">Texte à donner à ton IA d'images pour la planche</summary><pre class="partage-dle">2D fighting game character sprite sheet, [description of ${esc(f.titre)}], full body, side view facing right, anime dark fantasy style, 7 poses in a single row, evenly spaced, same size: idle fighting stance, walking, punch, high kick, casting magic, getting hit, signature finishing move. Plain white background, no text, no shadow</pre></details>
        <div id="app-msg" class="petit-texte"></div>
        <button class="btn petit btn-or" id="app-perso">🎨 Personnaliser couleurs et détails</button>
        <div id="app-editeur"></div>` : `<p class="discret petit-texte">Seuls l'auteur de la fiche et les admins peuvent changer son apparence.</p>`}`;
      if (!peut) return;
      const msg = (t) => ($("#app-msg").innerHTML = t);
      const sauver = async (champs, texte) => {
        try {
          const d = await api.sauverDuelPerso(f.id, { apparence: dd.apparence || {}, planche_url: dd.planche_url || null, finish_nom: dd.finish_nom || null, ...champs });
          const i = duelData.findIndex((x) => x.fiche_id === f.id); if (i >= 0) duelData[i] = d; else duelData.push(d);
          toast(texte); ecranChoix();
        } catch (e) { msg(`⚠️ ${esc(e.message)}`); }
      };
      $("#app-ia").onclick = async () => {
        const b = $("#app-ia"); b.disabled = true;
        const stop = attenteIA($("#app-msg"), ["L'IA regarde l'image…", "Elle note les cheveux, les yeux, la tenue…", "Elle prépare le combattant…"]);
        try { const r = await avecDelai(api.ia("apparence", { fiche_id: f.id })); stop(); await sauver({ apparence: r.apparence || {}, finish_nom: dd.finish_nom || r.finish || null }, "Apparence enregistrée !"); }
        catch (e) { stop(); msg(`⚠️ ${esc(e.message)}`); b.disabled = false; }
      };
      $("#app-planche").onchange = async (e) => {
        const fi = e.target.files[0]; if (!fi) return;
        msg("⏳ Envoi de la planche…");
        try {
          const url = await api.envoyerImage(fi);
          const p = await chargerPlanche(url);
          if (!p) return msg("⚠️ Je n'arrive pas à découper cette image. Vérifie que le fond est blanc et uni.");
          await sauver({ planche_url: url }, "Planche enregistrée !");
        } catch (er) { msg(`⚠️ ${esc(er.message)}`); }
      };
      const sp = $("#app-sans-planche"); if (sp) sp.onclick = () => sauver({ planche_url: null }, "Planche retirée.");
      $("#app-perso").onclick = () => { $("#app-perso").hidden = true; editeurDetaille($("#app-editeur"), f, dd, sauver); };
      $("#app-finish-ok").onclick = () => sauver({ finish_nom: $("#app-finish").value.trim() || null }, "Nom du coup de grâce enregistré.");
    };

    /* ----- éditeur détaillé : couleurs + détails, aperçu en direct ----- */
    const CHAMPS_EDIT = [
      ["Corps", [["peau", "Peau", "c"], ["femme", "Silhouette féminine", "b"], ["carrure", "Carrure", ["0:Fine", "1:Normale", "2:Massive"]], ["taille", "Taille", ["0.9:Petite", "1:Normale", "1.1:Grande"]]]],
      ["Cheveux", [["cheveux", "Couleur", "c"], ["meche", "Mèche (2e couleur)", "c?"], ["longueur", "Longueur", ["0:Très courts", "1:Courts", "2:Mi-longs", "3:Très longs"]], ["coiffure", "Coiffure", ["lisse:Lisses", "ebouriffe:Ébouriffés", "chignon:Chignon"]]]],
      ["Visage", [["yeux", "Yeux", "c"], ["yeuxBrillants", "Yeux lumineux", "b"], ["crocs", "Crocs", "b"], ["barbe", "Barbe", "c?"], ["levres", "Rouge à lèvres", "c?"], ["marques", "Marques / tatouages", "c?"], ["monocle", "Monocle", "b"]]],
      ["Tête", [["oreilles", "Oreilles", [":Normales", "pointues:Pointues (elfe)", "nageoire:Nageoires"]], ["chat", "Oreilles de chat", "b"], ["cornes", "Cornes", [":Aucune", "oni:Droites", "belier:Recourbées"]], ["couleurCornes", "Couleur des cornes", "c?"], ["couronne", "Couronne", "c?"], ["gemme", "Pierre de la couronne", "c?"], ["aureole", "Auréole", "b"], ["lunettes", "Lunettes d'aviateur", "b"]]],
      ["Tenue", [["haut", "Haut", "c"], ["torseNu", "Torse ouvert", "b"], ["tatouage", "Tatouage du torse", "c?"], ["armure", "Plastron", "c?"], ["manteau", "Manteau / cape", "c?"], ["manteauLong", "Manteau long", "b"], ["doublure", "Bordure", "c?"], ["robe", "Robe longue", "c?"], ["chaines", "Chaînes", "c?"], ["gants", "Gants", "c?"], ["pantalon", "Pantalon", "c"], ["bottes", "Bottes", "c"]]],
      ["Ailes et queue", [["ailes", "Ailes", [":Aucune", "plumes:Plumes", "chauve:Chauve-souris"]], ["ailesNb", "Nombre d'ailes", ["2:2", "6:6"]], ["couleurAiles", "Couleur des ailes", "c?"], ["veinesAiles", "Veines lumineuses", "c?"], ["queue", "Queue", "c?"]]],
      ["Coup signature", [["sig", "Type", [":Selon sa magie", "eventail:Éventail de projectiles", "teleport:Téléportation + coup", "vague:Vague au sol", "pluie:Pluie du ciel", "colonne:Pilier sous l'adversaire", "charge:Charge"]], ["sigNom", "Nom", "t"]]],
      ["Coup de grâce", [["finTheme", "Effet", [":Automatique (selon sa compétence)", "foudre:Foudre du ciel", "feu:Piliers de feu", "glace:Prison de glace", "sang:Lune de sang", "ombre:Tentacules d'ombre", "lumiere:Colonne de lumière", "nature:Ronces", "poison:Poison", "eau:Tourbillon d'eau", "vent:Tornade", "terre:Pics de pierre", "arcane:Cercle de runes", "physique:Pure force", "sceaux:Sceaux", "cartes:Cartes", "metamorphose:Bête (métamorphose)", "illusion:Copies (illusion)", "temps:Horloge (temps arrêté)", "gravite:Trou noir", "invocation:Spectre invoqué", "necro:Mains de squelettes", "telekinesie:Télékinésie", "son:Ondes sonores", "espace:Portails", "mots:Lettres"]], ["finCouleur", "Couleur (sinon selon le nom de la compétence)", "c?"]]],
      ["Combat", [["arme", "Arme", [":Aucune", "epee:Épée", "epee_sang:Épée de sang", "epee_noire:Épée noire", "faux:Faux", "lance:Lance", "trident:Trident", "baton:Bâton", "canne:Canne", "livre:Livre", "cartes:Cartes", "griffes:Griffes"]], ["aura", "Couleur de la magie", "c?"], ["mainMagique", "Magie dans la main", "b"]]],
    ];
    const versHex = (c) => { if (!c) return "#888888"; if (/^#[0-9a-f]{6}$/i.test(c)) return c; const m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? "#" + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, "0")).join("") : "#888888"; };
    const compDe = (f) => ((rpData.find((p) => p.fiche_id === f.id) || competencesLocales(f)).competences || []);
    const NOM_TYPE = { degats: "dégâts", etourdir: "étourdit", affaiblir: "affaiblit", soin: "soin", bouclier: "bouclier", provocation: "provocation" };
    const champsEdit = (f) => CHAMPS_EDIT.map(([titre, champs]) => titre !== "Coup de grâce" ? [titre, champs] : [titre, [["finComp", "Compétence utilisée (jeu Tactics)", [":Automatique (la plus forte)", ...((cs) => cs.map((c) => `${nomOption(c.nom)}:${nomOption(c.nom)} — ${NOM_TYPE[c.type] || c.type}, puissance ${c.puissance || 1}${c === cs[0] ? " (attaque de base)" : c === specialDe(cs) ? " (déjà le Spécial)" : c === superDe(cs) ? " (déjà le Super)" : ""}`))(compDe(f))]], ...champs]]);
    const NOMS_EFFETS = Object.fromEntries((CHAMPS_EDIT.find(([t]) => t === "Coup de grâce") || [0, [[0, 0, []]]])[1][0][2].map((o) => o.split(":")));
    const resumeFinish = (f, app, dd) => {
      const comp = compDe(f), u = ultiDe(comp, app, dd.finish_nom), el = elementDeFiche(f);
      const th = app.finTheme || themeFinishDe(f, u, ELEMENTS[el] ? el : "physique", dd.finish_nom);
      const coul = app.finCouleur || couleurFinishDe(u, dd.finish_nom);
      const nom = (dd.finish_nom || "").trim() || (u && u.nom) || "Coup de grâce";
      return `▶ Le coup de grâce sera : <b>${esc(nom)}</b> — effet <b>${esc(NOMS_EFFETS[th] || th)}</b>${coul ? ` <span style="display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle;background:${esc(coul)}"></span>` : ", couleur de son élément"}${u && u.description ? `<br><i>${esc(u.description)}</i>` : !u && (dd.finish_nom || "").trim() ? "<br><i>Nom choisi à la main : l'effet et la couleur sont devinés d'après ce nom.</i>" : ""}`;
    };
    const editeurDetaille = (zone, f, dd, sauver) => {
      const auto = apparenceAuto(f), ia = dd.apparence || {};
      const app = Object.keys(ia).length ? { ...auto, cornes: undefined, ailes: undefined, aureole: undefined, chat: undefined, crocs: undefined, oreilles: undefined, couronne: undefined, queue: undefined, armure: undefined, arme: undefined, ...ia } : { ...auto };
      Object.keys(app).forEach((k) => app[k] === undefined && delete app[k]);
      zone.innerHTML = `<div class="editeur-app">
        <canvas class="apercu-duel apercu-editeur" width="200" height="250"></canvas>
        <div class="ea-champs">${champsEdit(f).map(([titre, champs]) => `<fieldset><legend>${titre}</legend>${champs.map(([k, nom, type]) => {
          if (type === "b") return `<label class="ea-ligne"><input type="checkbox" data-ea="${k}" ${app[k] ? "checked" : ""}> ${nom}</label>`;
          if (type === "t") return `<label class="ea-ligne">${nom}<input data-ea="${k}" maxlength="30" value="${esc(app[k] || "")}" placeholder="ex : Danse des cartes"></label>`;
          if (Array.isArray(type)) return `<label class="ea-ligne">${nom}<select data-ea="${k}">${type.map((o) => { const [v, l] = o.split(":"); return `<option value="${v}" ${String(app[k] ?? "") === v ? "selected" : ""}>${l}</option>`; }).join("")}</select></label>`;
          const opt = type === "c?";
          return `<label class="ea-ligne">${nom}${opt ? `<input type="checkbox" data-ea-actif="${k}" ${app[k] ? "checked" : ""} title="Activer">` : ""}<input type="color" data-ea="${k}" value="${versHex(app[k])}" ${opt && !app[k] ? "disabled" : ""}></label>`;
        }).join("")}${titre === "Coup de grâce" ? `<p class="petit-texte" id="ea-finish"></p>` : ""}</fieldset>`).join("")}</div>
        <div class="rangee"><button class="btn btn-or" id="ea-sauver">💾 Enregistrer l'apparence</button><button class="btn petit" id="ea-auto">↺ Repartir de l'apparence devinée</button></div></div>`;
      // aperçu en direct (garde puis coup de poing, en boucle)
      const cv = $(".apercu-editeur", zone), cx = cv.getContext("2d"), t0 = performance.now();
      const anim = () => {
        if (!document.body.contains(cv)) return;
        const t = (performance.now() - t0) / 1000, cycle = t % 3, P = COMBATTANT.POSES;
        const pose = cycle < 2 ? Object.assign({}, P.garde, { hy: Math.sin(t * 2.2) * 1.3 }) : COMBATTANT.melanger(P.garde, P.special, Math.min(1, (cycle - 2) * 4));
        cx.clearRect(0, 0, 200, 250); cx.save(); cx.translate(100, 238); const ech = 1.05 / (app.taille || 1); cx.scale(ech, ech);
        cx.fillStyle = "rgba(0,0,0,0.4)"; cx.beginPath(); cx.ellipse(0, 0, 32, 6, 0, 0, 7); cx.fill();
        try { COMBATTANT.dessiner(cx, app, pose, t); } catch (e) {}
        cx.restore(); requestAnimationFrame(anim);
      };
      anim();
      $$("[data-ea]", zone).forEach((el) => (el.oninput = el.onchange = () => {
        const k = el.dataset.ea;
        if (el.type === "checkbox") { if (el.checked) app[k] = true; else delete app[k]; }
        else if (el.tagName === "SELECT") { const v = el.value; if (v === "") delete app[k]; else app[k] = /^[\d.]+$/.test(v) ? Number(v) : v; }
        else app[k] = el.value;
        majResume();
      }));
      $$("[data-ea-actif]", zone).forEach((el) => (el.onchange = () => {
        const k = el.dataset.eaActif, c = $(`[data-ea="${k}"]`, zone);
        c.disabled = !el.checked; if (el.checked) app[k] = c.value; else delete app[k];
        majResume();
      }));
      function majResume() { const r = $("#ea-finish", zone); if (r) try { r.innerHTML = resumeFinish(f, app, dd); } catch (e) { r.textContent = ""; } }
      majResume();
      $("#ea-sauver", zone).onclick = () => { const a = {}; Object.entries(app).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") a[k] = v; }); sauver({ apparence: a }, "Apparence enregistrée !"); };
      $("#ea-auto", zone).onclick = () => { dd = { ...dd, apparence: {} }; editeurDetaille(zone, f, dd, sauver); };
    };

    /* ----- lancement ----- */
    const lancer = async (opts = {}) => {
      const mode = opts.mode || choix.mode;
      const duoActif = opts.duo !== undefined ? opts.duo : choix.duo && duoPossible() && mode !== "arcade" && mode !== "entrainement";
      const f1 = indexParId.get(opts.p1 || choix.p1), f2 = indexParId.get(opts.p2 || choix.p2);
      const [c1, c2] = await Promise.all([combattantDe(f1, duelData, rpData), combattantDe(f2, duelData, rpData)]);
      let equipes = null;
      if (duoActif) {
        const [c1b, c2b] = await Promise.all([combattantDe(indexParId.get(opts.p1b || choix.p1b), duelData, rpData), combattantDe(indexParId.get(opts.p2b || choix.p2b), duelData, rpData)]);
        equipes = [[c1, c1b], [c2, c2b]];
      }
      z.innerHTML = `
        <div class="duel-cadre" id="duel-cadre">
          <canvas id="duel-canvas" width="${W_D}" height="${H_D}"></canvas>
          <div class="manette" id="manette">
            <div class="stick" id="stick" aria-label="Croix : glisse le pouce, les diagonales marchent">${[["h", "▲"], ["g", "◀"], ["b", "▼"], ["d", "▶"]].map(([k, s]) => `<span class="st-f st-${k}">${s}</span>`).join("")}<div class="st-pouce"></div></div>
            <div class="boutons-combat${equipes ? " avec-tag" : ""}">${[["spe", "Spé"], ["sup", "Super"], ["sig", "★"], ...(equipes ? [["tag", "⇄"]] : []), ["coup", "Coup"], ["fort", "Fort"]].map(([k, s]) => `<button data-k="${k}" class="mk mk-${k}">${s}</button>`).join("")}</div>
          </div>
          <button class="btn petit duel-plein" id="duel-plein" title="Plein écran">⛶</button>
          <button class="btn petit duel-sortie" id="duel-sortie" title="Quitter">↩</button>
          <button class="btn petit duel-son" id="duel-son" title="Son">${SON.coupe ? "🔇" : "🔊"}</button>
        </div>
        <div class="rangee centre"><button class="btn petit" id="duel-quitter">↩ Quitter</button></div>`;
      const areneDe = (a) => { if (a === "hasard" || !a) { const l = Object.keys(ARENES); return l[Math.floor(Math.random() * l.length)]; } if (a.startsWith("lieu:")) { const f = indexParId.get(a.slice(5)); return f ? areneDeLieu(f) : "cathedrale"; } return ARENES[a] ? a : "cathedrale"; };
      const arene = opts.arene || areneDe(choix.arene);
      const lieu = !opts.arene && choix.arene.startsWith("lieu:") ? (indexParId.get(choix.arene.slice(5)) || {}).titre : opts.lieu;
      partie = window.__duel = demarrerPartie($("#duel-canvas"), c1, c2, { arene, lieu, mode, equipes, niveau: opts.niveau || choix.niveau, boss: opts.boss, mannequin: choix.mannequin, salle: opts.salle || null, role: opts.role || "hote", fin: opts.fin || finPartie });
      $("#duel-son").onclick = () => { const m = partie.basculerSon(); $("#duel-son").textContent = m ? "🔇" : "🔊"; };
      $("#duel-quitter").onclick = () => { quitterPlein(); if (salle) { salle.unsubscribe(); salle = null; } ecranChoix(); };
      $("#duel-sortie").onclick = () => $("#duel-quitter").click();
      // téléphone à l'horizontale : le combat prend tout l'écran, croix à gauche, boutons à droite
      const cadreJeu = $("#duel-cadre");
      if (!matchMedia("(hover: hover) and (pointer: fine)").matches) {
        cadreJeu.classList.add("tactile");
        const ajuster = () => { if (!document.body.contains(cadreJeu)) { window.removeEventListener("resize", ajuster); return; } if (cadreJeu.dataset.fini) return; cadreJeu.classList.toggle("pseudo-plein", innerWidth > innerHeight || !!document.fullscreenElement); };
        ajuster(); window.addEventListener("resize", ajuster);
      }
      $("#duel-plein").onclick = async () => {
        const cadre = $("#duel-cadre");
        try { if (!document.fullscreenElement) { await cadre.requestFullscreen(); if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape").catch(() => {}); } else await document.exitFullscreen(); } catch (e) { cadre.classList.toggle("pseudo-plein"); }
      };
    };
    // fin du combat : on sort du plein écran pour voir les résultats
    const quitterPlein = () => { const c = $("#duel-cadre"); if (c) { c.dataset.fini = "1"; c.classList.remove("pseudo-plein"); } if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
    const posterDiscord = async (titre, texte) => { try { await api.ia("discord", { type: "jeu", salon: "des", titre, texte }); toast("Résultat posté sur Discord !"); } catch (e) { toast(e.message, "erreur"); } };
    const finPartie = (res) => {
      quitterPlein();
      const mode = salle ? "ligne" : choix.mode;
      if (res.gagne && res.moi && estMembre()) {
        if (mode === "ordi") sauverScore("duel", 1, { perso: res.moi.f.id, contre: res.perdant && res.perdant.f.id, niveau: choix.niveau });
        if (mode === "ligne") sauverScore("duel_ligne", 1, { perso: res.moi.f.id, contre: res.perdant && res.perdant.f.id });
      }
      const zr = document.createElement("div");
      zr.className = "duel-fin";
      const peutPoster = res.gagnant && ["ligne", "ordi", "deux"].includes(mode) && estMembre();
      zr.innerHTML = `<div class="jeu-victoire"><div class="jv-titre">${res.titre}</div>${res.finish ? `<p>💀 Coup de grâce : <b>${esc(res.finish)}</b></p>` : ""}
        <div class="rangee centre">${salle ? "" : `<button class="btn btn-or" id="duel-revanche">🔁 Revanche</button>`}${peutPoster ? `<button class="btn btn-discord" id="duel-poster">📣 Poster sur Discord</button>` : ""}<button class="btn" id="duel-retour">👥 Changer de combattants</button></div></div>`;
      z.appendChild(zr);
      const pd = $("#duel-poster"); if (pd) pd.onclick = () => { pd.disabled = true; posterDiscord(`🥊 Duel : ${res.gagnant.nom} bat ${res.perdant.nom} !`, `${mode === "ligne" ? `Combat en ligne, gagné par ${res.gagne ? moiPseudo() : "son adversaire"}` : mode === "ordi" ? `${moiPseudo()} contre l'ordinateur (${choix.niveau})` : "À deux sur le même clavier"}${res.finish ? `\n💀 Coup de grâce : **${res.finish}**` : ""}`); };
      const rv = $("#duel-revanche"); if (rv) rv.onclick = () => lancer();
      $("#duel-retour").onclick = () => { if (salle) { salle.unsubscribe(); salle = null; } ecranChoix(); };
    };

    /* ----- en ligne : salle avec un lien ----- */
    const creerSalle = () => {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
      ouvrirSalle(code, "hote");
    };
    const ouvrirSalle = (code, role) => {
      if (!estMembre()) { z.innerHTML = `<p class="note">Connecte-toi avec un compte membre pour jouer en ligne.</p>`; return; }
      const lien = `${location.origin}${location.pathname}#/jeux/duel?salle=${code}`;
      let monChoix = role === "hote" ? choix.p1 : choix.p2 && choix.p2 !== choix.p1 ? choix.p2 : choix.p1, monChoix2 = role === "hote" ? choix.p1b : choix.p2b, pret = false, autre = null;
      const duoSalle = () => (role === "hote" ? !!choix.duo : !!(autre && autre.duo));
      try { salle = api.salleDuel(code); } catch (e) { z.innerHTML = `<p class="note erreur-note">${esc(e.message)}</p>`; return; }
      const dessinerSalle = () => {
        const f = indexParId.get(monChoix), fa = autre && indexParId.get(autre.fiche);
        z.innerHTML = `<div class="duel-choix">
          <h2>🌐 Salle ${esc(code)}</h2>
          ${role === "hote" ? `<p>Envoie ce lien à ton adversaire :</p><div class="rangee"><input readonly value="${esc(lien)}" class="lien-salle"><button class="btn petit btn-or" id="copier-lien">📋 Copier</button>${navigator.share ? `<button class="btn petit" id="partager-lien">📤 Partager</button>` : ""}<button class="btn petit btn-discord" id="defi-discord">📣 Défier sur Discord</button></div>` : ""}
          <div class="duel-vs">
            <div class="dc-cote"><div class="dc-label">Toi</div><div class="dc-paire"><div id="ap1"></div>${duoSalle() ? `<div id="ap1b" class="ap-partenaire"></div>` : ""}</div><div class="dc-nom">${esc(f.titre)}${duoSalle() ? ` <small>&amp; ${esc(indexParId.get(monChoix2).titre)}</small>` : ""}</div>${pret ? `<div class="dc-pret">✅ Prêt</div>` : `<div class="rangee centre"><button class="btn petit" data-changer>Changer</button>${duoSalle() ? `<button class="btn petit" data-changer2>Partenaire</button>` : ""}</div>`}</div>
            <div class="dc-vs-mot">VS</div>
            <div class="dc-cote"><div class="dc-label">${autre ? esc(autre.pseudo) : "En attente…"}</div>${fa ? `<div class="dc-paire"><div id="ap2"></div>${duoSalle() && autre.fiche2 ? `<div id="ap2b" class="ap-partenaire"></div>` : ""}</div><div class="dc-nom">${esc(fa.titre)}${duoSalle() && autre.fiche2 && indexParId.get(autre.fiche2) ? ` <small>&amp; ${esc(indexParId.get(autre.fiche2).titre)}</small>` : ""}</div>${autre.pret ? `<div class="dc-pret">✅ Prêt</div>` : ""}` : `<div class="dc-mystere">⏳</div>`}</div>
          </div>
          ${duoSalle() ? `<p class="discret petit-texte centre">👥 Combat en duo : 2 contre 2 avec relais.</p>` : ""}
          <div class="rangee centre">${pret ? `<p>En attente de l'adversaire…</p>` : `<button class="btn btn-or large" id="je-suis-pret">✅ Je suis prêt</button>`}<button class="btn petit" id="quitter-salle">Quitter</button></div>
          <div id="duel-liste"></div></div>`;
        $("#ap1").appendChild(apercu(f, 0));
        if ($("#ap2")) $("#ap2").appendChild(apercu(fa, 1));
        if ($("#ap1b")) $("#ap1b").appendChild(apercu(indexParId.get(monChoix2), 0));
        if ($("#ap2b") && indexParId.get(autre.fiche2)) $("#ap2b").appendChild(apercu(indexParId.get(autre.fiche2), 1));
        const cp = $("#copier-lien"); if (cp) cp.onclick = () => copier(lien);
        const pa = $("#partager-lien"); if (pa) pa.onclick = () => navigator.share({ title: "Duel sur Aetheria", text: `Je te défie au Duel d'Aetheria avec ${f.titre} !`, url: lien }).catch(() => {});
        const dc = $("#defi-discord"); if (dc) dc.onclick = async () => { try { await api.ia("discord", { type: "jeu", salon: "des", titre: `🥊 ${moiPseudo()} lance un défi au Duel !`, texte: `${f.titre} attend un adversaire.\nRejoins le combat : ${lien}` }); toast("Défi envoyé sur Discord !"); } catch (e) { toast(e.message, "erreur"); } };
        const ch = $("[data-changer]", z); if (ch) ch.onclick = () => {
          const zl = $("#duel-liste");
          zl.innerHTML = `<div class="grille-duel">${persos.map((p) => `<button class="perso-duel ${monChoix === p.id ? "actif" : ""}" data-p="${esc(p.id)}">${vignette(p)}<span>${esc(p.titre)}</span></button>`).join("")}</div>`;
          $$("[data-p]", zl).forEach((b) => (b.onclick = () => { monChoix = b.dataset.p; annoncer(); dessinerSalle(); }));
        };
        const ch2 = $("[data-changer2]", z); if (ch2) ch2.onclick = () => {
          const zl = $("#duel-liste");
          zl.innerHTML = `<div class="grille-duel">${persos.map((p) => `<button class="perso-duel ${monChoix2 === p.id ? "actif" : ""}" data-p="${esc(p.id)}">${vignette(p)}<span>${esc(p.titre)}</span></button>`).join("")}</div>`;
          $$("[data-p]", zl).forEach((b) => (b.onclick = () => { monChoix2 = b.dataset.p; annoncer(); dessinerSalle(); }));
        };
        const jp = $("#je-suis-pret"); if (jp) jp.onclick = () => { pret = true; annoncer(); dessinerSalle(); verifier(); };
        $("#quitter-salle").onclick = () => { salle.unsubscribe(); salle = null; history.replaceState(null, "", "#/jeux/duel"); ecranChoix(); };
      };
      const annoncer = () => salle && salle.track({ pseudo: moiPseudo(), fiche: monChoix, fiche2: monChoix2, duo: role === "hote" ? !!choix.duo : undefined, pret, role });
      const verifier = () => {
        if (role !== "hote" || !pret || !autre || !autre.pret) return;
        const ar = choix.arene.startsWith("lieu:") ? areneDeLieu(indexParId.get(choix.arene.slice(5)) || {}) : ARENES[choix.arene] ? choix.arene : Object.keys(ARENES)[Math.floor(Math.random() * Object.keys(ARENES).length)];
        const li = choix.arene.startsWith("lieu:") ? (indexParId.get(choix.arene.slice(5)) || {}).titre : null;
        const duoOk = !!choix.duo && !!autre.fiche2 && indexParId.has(autre.fiche2);
        const pl = { p1: monChoix, p2: autre.fiche, p1b: monChoix2, p2b: autre.fiche2, duo: duoOk, arene: ar, lieu: li };
        salle.send({ type: "broadcast", event: "debut", payload: pl });
        lancer({ ...pl, mode: "ligne", salle, role: "hote" });
      };
      salle.on("presence", { event: "sync" }, () => {
        const etat = salle.presenceState(), autres = Object.entries(etat).filter(([k]) => k !== ((api.moi || {}).user || {}).id).map(([, v]) => v[v.length - 1]);
        const avant = autre; autre = autres[0] || null;
        if (partie && avant && !autre) { toast("Ton adversaire s'est déconnecté.", "erreur"); partie.arreter(); finPartie({ titre: "🔌 Adversaire déconnecté" }); return; }
        if (!partie) { dessinerSalle(); verifier(); }
      });
      salle.on("broadcast", { event: "debut" }, ({ payload }) => { if (role === "invite") lancer({ p1: payload.p1, p2: payload.p2, p1b: payload.p1b, p2b: payload.p2b, duo: !!payload.duo, mode: "ligne", salle, role: "invite", arene: payload.arene, lieu: payload.lieu }); });
      salle.subscribe((s) => { if (s === "SUBSCRIBED") annoncer(); if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") toast("Connexion à la salle impossible. Réessaie.", "erreur"); });
      dessinerSalle();
    };
    const moiPseudo = () => ((moi() && moi().profil && moi().profil.pseudo) || "Un joueur");

    /* ----- mode Arcade : 6 combats de plus en plus durs, jusqu'au boss ----- */
    let arcade = null;
    const arcadeDebut = () => {
      const moiF = indexParId.get(choix.p1);
      const autres = persos.filter((f) => f.id !== moiF.id).sort((a, b) => puissance(a) - puissance(b));
      if (!autres.length) return toast("Il faut au moins deux personnages.", "erreur");
      const n = Math.min(6, autres.length), liste = [];
      // adversaires répartis du plus faible au plus fort ; le dernier (boss) est le plus puissant
      for (let i = 0; i < n - 1; i++) liste.push(autres[Math.floor((i * (autres.length - 1)) / Math.max(1, n - 1))]);
      liste.push(autres[autres.length - 1]);
      const vus = new Set(), propre = liste.filter((f) => !vus.has(f.id) && vus.add(f.id));
      arcade = { liste: propre, i: 0, score: 0, debut: Date.now(), continues: 0, histoire: "" };
      arcadeEcran();
    };
    const arcadeEcran = (message) => {
      const a = arcade, moiF = indexParId.get(choix.p1), adv = a.liste[a.i], dernier = a.i === a.liste.length - 1;
      const niveau = a.i < 2 ? "facile" : a.i < 4 ? "normal" : "difficile";
      z.innerHTML = `<div class="duel-choix arcade">
        <h2>🕹️ Arcade — combat ${a.i + 1}/${a.liste.length}${dernier ? " · <span class='rouge'>BOSS</span>" : ""}</h2>
        ${message || ""}
        <div class="arcade-echelle">${a.liste.map((f, k) => `<div class="ae-case ${k < a.i ? "battu" : k === a.i ? "actuel" : ""}">${vignette(f)}<span>${k === a.liste.length - 1 ? "👑 " : ""}${esc(f.titre)}</span></div>`).join("")}</div>
        <div class="duel-vs"><div class="dc-cote"><div id="ap1"></div><div class="dc-nom">${esc(moiF.titre)}</div></div><div class="dc-vs-mot">VS</div><div class="dc-cote"><div id="ap2"></div><div class="dc-nom">${esc(adv.titre)}${dernier ? " 👑" : ""}</div></div></div>
        <p class="centre">Score : <b>${a.score}</b> · niveau ${niveau}</p>
        ${a.i === 0 ? `<div class="arcade-histoire" id="arcade-histoire"><p><i>${esc(moiF.titre)} part affronter les plus redoutables combattants d'Aetheria. Au bout du chemin l'attend ${esc(a.liste[a.liste.length - 1].titre)}…</i></p>${estMembre() ? `<button class="btn petit" id="arcade-ia">🤖 Écrire l'histoire avec l'IA</button>` : ""}</div>` : ""}
        <div class="rangee centre"><button class="btn btn-or large" id="arcade-go">⚔️ Combattre</button><button class="btn petit" id="arcade-quitter">Abandonner</button></div></div>`;
      $("#ap1").appendChild(apercu(moiF, 0)); $("#ap2").appendChild(apercu(adv, 1));
      const bi = $("#arcade-ia"); if (bi) bi.onclick = async () => {
        bi.disabled = true; const zh = $("#arcade-histoire"); const stop = attenteIA(zh, ["L'IA relit les fiches…", "Elle écrit l'histoire…"]);
        try { const r = await avecDelai(api.ia("question", { question: `Écris en 6 à 8 lignes, de façon épique, l'introduction d'un mode Arcade de jeu de combat : ${moiF.titre} doit vaincre tour à tour ${a.liste.map((f) => f.titre).join(", ")} (le dernier est le boss final). Respecte leurs fiches et leurs relations si elles existent. Réponds seulement avec le texte.` })); stop(); a.histoire = r.texte; zh.innerHTML = `<div class="contenu ia-texte">${markdown(r.texte)}</div>`; }
        catch (e) { stop(); zh.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message)}</p>`; }
      };
      $("#arcade-go").onclick = () => lancer({ mode: "arcade", p2: adv.id, niveau, boss: dernier, duo: false, fin: arcadeFin });
      $("#arcade-quitter").onclick = () => { arcade = null; ecranChoix(); };
    };
    const arcadeFin = (res) => {
      quitterPlein();
      const a = arcade; if (!a) return;
      if (!res.gagne) {
        const zr = document.createElement("div"); zr.className = "duel-fin";
        zr.innerHTML = `<div class="jeu-defaite"><div class="jv-titre">💀 Défaite contre ${esc(res.gagnant.nom)}</div><p>Score : ${a.score}. Continuer coûte la moitié de ton score.</p>
          <div class="rangee centre"><button class="btn btn-or" id="arcade-continue">🔁 Continuer</button><button class="btn" id="arcade-stop">Arrêter là</button></div></div>`;
        z.appendChild(zr);
        $("#arcade-continue").onclick = () => { a.score = Math.floor(a.score / 2); a.continues++; arcadeEcran(); };
        $("#arcade-stop").onclick = () => arcadeTermine(false);
        return;
      }
      const gain = 1000 + (res.chrono || 0) * 10 + Math.round((res.pv || 0) * 1000) + (res.parfait ? 2000 : 0) + (res.finish ? 1500 : 0) + (a.i === a.liste.length - 1 ? 3000 : 0);
      a.score += gain; a.i++;
      const detail = `<p class="centre">+${gain} points${res.parfait ? " · PARFAIT !" : ""}${res.finish ? " · coup de grâce" : ""}</p>`;
      if (a.i >= a.liste.length) arcadeTermine(true, detail); else arcadeEcran(detail);
    };
    const arcadeTermine = (gagne, detail = "") => {
      const a = arcade, moiF = indexParId.get(choix.p1), duree = Math.round((Date.now() - a.debut) / 1000);
      if (gagne && estMembre()) sauverScore("arcade", Math.min(1000, Math.round(a.score / 100)), { perso: moiF.id, score: a.score, duree, continues: a.continues });
      z.innerHTML = `<div class="duel-choix arcade"><div class="${gagne ? "jeu-victoire" : "jeu-defaite"}">
        <div class="jv-titre">${gagne ? `👑 ${esc(moiF.titre)} a vaincu l'Arcade !` : "Arcade terminée"}</div>${detail}
        <p>Score final : <b>${a.score}</b> · ${Math.floor(duree / 60)} min ${duree % 60} s${a.continues ? ` · ${a.continues} continue${a.continues > 1 ? "s" : ""}` : ""}</p>
        <div id="arcade-fin-ia"></div>
        <div class="rangee centre">${gagne && estMembre() ? `<button class="btn" id="arcade-fin-histoire">🤖 La fin de l'histoire</button><button class="btn btn-discord" id="arcade-poster">📣 Poster sur Discord</button>` : ""}<button class="btn btn-or" id="arcade-rejouer">🔁 Rejouer</button><button class="btn" id="arcade-retour">↩ Retour</button></div></div></div>`;
      const bh = $("#arcade-fin-histoire"); if (bh) bh.onclick = async () => {
        bh.disabled = true; const zh = $("#arcade-fin-ia"); const stop = attenteIA(zh, ["L'IA écrit la fin…"]);
        try { const r = await avecDelai(api.ia("question", { question: `Écris en 6 à 8 lignes la fin épique du mode Arcade : ${moiF.titre} vient de vaincre ${a.liste.map((f) => f.titre).join(", ")}, et en dernier le boss ${a.liste[a.liste.length - 1].titre}. Que devient ${moiF.titre} ? Respecte sa fiche.${a.histoire ? " Voici l'introduction qui avait été écrite : " + a.histoire : ""} Réponds seulement avec le texte.` })); stop(); zh.innerHTML = `<div class="contenu ia-texte">${markdown(r.texte)}</div>`; }
        catch (e) { stop(); zh.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message)}</p>`; bh.disabled = false; }
      };
      const bp = $("#arcade-poster"); if (bp) bp.onclick = () => { bp.disabled = true; posterDiscord(`🕹️ ${moiPseudo()} a terminé l'Arcade avec ${moiF.titre} !`, `Score : **${a.score}** en ${Math.floor(duree / 60)} min ${duree % 60} s\nBoss vaincu : ${a.liste[a.liste.length - 1].titre}`); };
      $("#arcade-rejouer").onclick = () => arcadeDebut();
      $("#arcade-retour").onclick = () => { arcade = null; ecranChoix(); };
    };

    /* ----- classement du Duel ----- */
    const afficherClassement = async (zc) => {
      if (zc.innerHTML) { zc.innerHTML = ""; return; }
      zc.innerHTML = `<p class="discret">Chargement…</p>`;
      const depuis = jourLocal(new Date(Date.now() - 30 * 86400000));
      const [scores, auteurs] = await Promise.all([api.listerScores(depuis).catch(() => []), auteursMap()]);
      const pseudo = (id) => esc((auteurs.get(id) || {}).pseudo || "?");
      const somme = (jeu) => { const m = new Map(); scores.filter((x) => x.jeu === jeu).forEach((x) => m.set(x.user_id, (m.get(x.user_id) || 0) + x.score)); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10); };
      const record = () => { const m = new Map(); scores.filter((x) => x.jeu === "arcade").forEach((x) => { const v = (x.details && x.details.score) || x.score * 100; if (!m.has(x.user_id) || m.get(x.user_id)[0] < v) m.set(x.user_id, [v, x.details && x.details.perso]); }); return [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 10); };
      const joues = (() => { const m = new Map(); scores.filter((x) => ["duel", "duel_ligne", "arcade"].includes(x.jeu) && x.details && x.details.perso).forEach((x) => m.set(x.details.perso, (m.get(x.details.perso) || 0) + 1)); return [...m.entries()].filter(([id]) => indexParId.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 8); })();
      const ligne = (l, f) => (l.length ? `<ol class="classement">${l.map((e, i) => `<li><span class="cl-rang">${["🥇", "🥈", "🥉"][i] || i + 1}</span>${f(e)}</li>`).join("")}</ol>` : `<p class="discret petit-texte">Personne pour l'instant.</p>`);
      zc.innerHTML = `<div class="classements">
        <div class="classement-bloc"><h3>🌐 Victoires en ligne (30 jours)</h3>${ligne(somme("duel_ligne"), ([id, v]) => `<span class="cl-nom">${pseudo(id)}</span><b>${v}</b>`)}</div>
        <div class="classement-bloc"><h3>🕹️ Records de l'Arcade</h3>${ligne(record(), ([id, [v, p]]) => `<span class="cl-nom">${pseudo(id)}${p && indexParId.get(p) ? ` <small class="discret">(${esc(indexParId.get(p).titre)})</small>` : ""}</span><b>${v}</b>`)}</div>
        <div class="classement-bloc"><h3>🤖 Victoires contre l'ordi (30 jours)</h3>${ligne(somme("duel"), ([id, v]) => `<span class="cl-nom">${pseudo(id)}</span><b>${v}</b>`)}</div>
        <div class="classement-bloc"><h3>⭐ Personnages les plus joués</h3>${ligne(joues, ([id, v]) => `<span class="cl-nom">${esc(indexParId.get(id).titre)}</span><b>${v}</b> <small class="discret">victoire${v > 1 ? "s" : ""}</small>`)}</div>
      </div>`;
    };

    if (codeSalle) ouvrirSalle(codeSalle.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8), "invite");
    else ecranChoix();
  };

  /* ---------- la partie elle-même ---------- */
  function demarrerPartie(canvas, c1, c2, opts) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W_D * dpr; canvas.height = H_D * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // en duo (2 contre 2), chaque camp a 2 combattants ; J[camp] = celui qui est sur le terrain
    const equipes = opts.equipes ? opts.equipes.map((eq, side) => eq.map((c) => creerCombattant(c, side))) : [[creerCombattant(c1, 0)], [creerCombattant(c2, 1)]];
    const J = [equipes[0][0], equipes[1][0]], actifs = [0, 0], duo = !!opts.equipes;
    const ROUNDS = duo || opts.mode === "arcade" && opts.unRound ? 1 : 2;
    const entrainement = opts.mode === "entrainement", contreOrdi = opts.mode === "ordi" || opts.mode === "arcade";
    if (opts.boss) { const b = J[1]; b.pvMax = Math.round(b.pvMax * 1.4); b.attMul *= 1.15; b.boss = true; }
    const invite = opts.mode === "ligne" && opts.role === "invite";
    const moiIdx = invite ? 1 : 0;
    const etat = { victoires: [0, 0], round: 1, chrono: 60 * 60, phase: "intro", phaseT: 0, gel: 0, ralenti: 0, secousse: 0, flash: 0, banniere: null, projectiles: [], fini: false, acheve: null, finish: null };
    const parts = [], textes = [], evts = [];
    let vivante = true, acc = 0, dernier = performance.now(), t0 = performance.now();
    // ---- commandes ----
    const cmd = [{ g: 0, d: 0, h: 0, b: 0, coup: 0, fort: 0, spe: 0, sup: 0, sig: 0, tag: 0 }, { g: 0, d: 0, h: 0, b: 0, coup: 0, fort: 0, spe: 0, sup: 0, sig: 0, tag: 0 }];
    const deuxJoueurs = opts.mode === "deux";
    const TOUCHES1 = deuxJoueurs ? { KeyA: "g", KeyQ: "g", KeyD: "d", KeyW: "h", KeyZ: "h", KeyS: "b", KeyF: "coup", KeyG: "fort", KeyH: "spe", KeyT: "sup", KeyR: "sig", KeyY: "tag" }
      : { ArrowLeft: "g", KeyA: "g", KeyQ: "g", ArrowRight: "d", KeyD: "d", ArrowUp: "h", KeyW: "h", KeyZ: "h", Space: "h", ArrowDown: "b", KeyS: "b", KeyJ: "coup", KeyX: "coup", KeyK: "fort", KeyC: "fort", KeyL: "spe", KeyV: "spe", KeyI: "sup", KeyB: "sup", KeyO: "sig", KeyN: "sig", KeyU: "tag", KeyE: "tag" };
    const TOUCHES2 = { ArrowLeft: "g", ArrowRight: "d", ArrowUp: "h", ArrowDown: "b", Digit1: "coup", Numpad1: "coup", Digit2: "fort", Numpad2: "fort", Digit3: "spe", Numpad3: "spe", Digit0: "sup", Numpad0: "sup", Digit4: "sig", Numpad4: "sig", Digit5: "tag", Numpad5: "tag" };
    // un appui très court (tap) compte quand même : on le garde jusqu'à l'image suivante
    const presser = (i, k, v) => { if (v) SON.init(); if (["coup", "fort", "spe", "sup", "sig", "tag"].includes(k)) { if (v) cmd[i][k] = 1; } else { cmd[i][k] = v; if (v) cmd[i]["tap_" + k] = 1; } if (invite) envoyerEntree(); };
    const clavier = (e, v) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const k1 = TOUCHES1[e.code], k2 = deuxJoueurs ? TOUCHES2[e.code] : null;
      if (k1 || k2) { e.preventDefault(); if (e.repeat) return; }
      if (k1) presser(moiIdx, k1, v); if (k2) presser(1, k2, v);
    };
    const kd = (e) => clavier(e, 1), ku = (e) => clavier(e, 0);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    const stick = document.getElementById("stick");
    if (stick) {
      const dirs = { g: 0, d: 0, h: 0, b: 0 }, pouce = stick.querySelector(".st-pouce"); let doigt = null;
      const appliquer = (n) => { for (const k of ["g", "d", "h", "b"]) if (n[k] !== dirs[k]) { dirs[k] = n[k]; presser(moiIdx, k, n[k]); const f = stick.querySelector(".st-" + k); if (f) f.classList.toggle("appuye", !!n[k]); } };
      const lire = (e) => {
        const r = stick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), dist = Math.hypot(dx, dy);
        const n = { g: 0, d: 0, h: 0, b: 0 };
        if (dist > r.width * 0.13) { const a = Math.atan2(dy, dx) * 180 / Math.PI; if (a > -67.5 && a < 67.5) n.d = 1; if (a > 112.5 || a < -112.5) n.g = 1; if (a > 22.5 && a < 157.5) n.b = 1; if (a < -22.5 && a > -157.5) n.h = 1; }
        const m = Math.min(dist, r.width * 0.3), k = dist ? m / dist : 0; pouce.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        appliquer(n);
      };
      stick.addEventListener("pointerdown", (e) => { e.preventDefault(); if (doigt !== null) return; doigt = e.pointerId; try { stick.setPointerCapture(doigt); } catch (_) {} SON.init(); stick.classList.add("actif"); lire(e); });
      stick.addEventListener("pointermove", (e) => { if (e.pointerId === doigt) { e.preventDefault(); lire(e); } });
      const lacher = (e) => { if (e.pointerId !== doigt) return; doigt = null; stick.classList.remove("actif"); pouce.style.transform = ""; appliquer({ g: 0, d: 0, h: 0, b: 0 }); };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => stick.addEventListener(t, lacher));
      stick.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    const manette = document.getElementById("manette");
    if (manette) $$("[data-k]", manette).forEach((b) => {
      const k = b.dataset.k;
      const on = (e) => { e.preventDefault(); b.classList.add("appuye"); try { b.setPointerCapture(e.pointerId); } catch (_) {} presser(moiIdx, k, 1); };
      const off = (e) => { e.preventDefault(); b.classList.remove("appuye"); presser(moiIdx, k, 0); };
      b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("lostpointercapture", off);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    });
    // ---- réseau ----
    const salle = opts.salle;
    let derniereEntree = 0, instantane = null, envoiEtat = 0;
    function envoyerEntree() { if (!salle) return; const now = performance.now(); if (now - derniereEntree < 25 && !cmd[1].coup && !cmd[1].fort && !cmd[1].spe && !cmd[1].sup && !cmd[1].sig && !cmd[1].tag && !cmd[1].tap_h && !cmd[1].tap_d && !cmd[1].tap_g) return; derniereEntree = now; salle.send({ type: "broadcast", event: "entree", payload: { ...cmd[1] } }); cmd[1].coup = cmd[1].fort = cmd[1].spe = cmd[1].sup = cmd[1].sig = cmd[1].tag = cmd[1].tap_h = cmd[1].tap_b = cmd[1].tap_g = cmd[1].tap_d = 0; }
    if (salle) {
      if (!invite) salle.on("broadcast", { event: "entree" }, ({ payload }) => { for (const k of ["g", "d", "h", "b"]) cmd[1][k] = payload[k] ? 1 : 0; for (const k of ["coup", "fort", "spe", "sup", "sig", "tag", "tap_h", "tap_b", "tap_g", "tap_d"]) if (payload[k]) cmd[1][k] = 1; });
      else salle.on("broadcast", { event: "etat" }, ({ payload }) => { instantane = payload; (payload.evts || []).forEach(jouerEvt); });
      if (invite) var battement = setInterval(() => vivante && salle && salle.send({ type: "broadcast", event: "entree", payload: { g: cmd[1].g, d: cmd[1].d, h: cmd[1].h, b: cmd[1].b } }), 150);
    }
    // ---- outils ----
    const rnd = (a, b) => a + Math.random() * (b - a);
    const auSol = (p) => p.y >= SOL - 0.5;
    const evt = (e) => { if (salle && !invite) evts.push(e); jouerEvt(e); };
    function jouerEvt(e) {
      if (e.k === "impact") SON.jouer(e.fort ? "fort" : "coup"); else if (e.k === "garde") SON.jouer("garde"); else if (e.k === "lancer") SON.jouer("magie"); else if (e.k === "son") SON.jouer(e.n, e.f || 1); else if (e.k === "finish") SON.jouer("super");
      if (e.k === "banniere") { const v = { "K.O.": "K.O. !", "COMBAT !": "Combat !", "ACHÈVE-LE !": "Achève-le !" }[e.txt] || (/^Round \d/.test(e.txt) ? e.txt : /gagne !$/.test(e.txt) ? e.txt : null); if (v) SON.voix(v); if (e.txt === "K.O.") SON.jouer("ko"); if (/^SUPER/.test(e.sous || "")) SON.jouer("super"); }
      if (e.k === "chute") { SON.jouer("fort", 0.6); etat.secousse = Math.max(etat.secousse, 4); for (let i = 0; i < 18; i++) ajouter({ x: e.x + rnd(-40, 40), y: SOL - 2, vx: rnd(-90, 90), vy: rnd(-70, -15), couleur: "rgba(200,190,170,0.8)", forme: "fumee", taille: rnd(5, 10), vie: rnd(0.4, 0.7), add: false }); }
      if (e.k === "fumee") { for (let i = 0; i < 26; i++) ajouter({ x: e.x + rnd(-20, 20), y: e.y + rnd(-60, 10), vx: rnd(-40, 40), vy: rnd(-60, -10), couleur: i % 2 ? "#2a1430" : "#5a2a6a", forme: "fumee", taille: rnd(8, 16), vie: rnd(0.4, 0.8), add: false }); anneau(e.x, e.y - 40, "#9a5cff", 40); }
      if (e.k === "marque") { const E2 = ELEMENTS[e.el] || ELEMENTS.physique; anneau(e.x, SOL, E2.glow, 46); for (let i = 0; i < 10; i++) ajouter({ x: e.x + rnd(-30, 30), y: SOL - 2, vy: rnd(-40, -10), couleur: E2.c1, taille: rnd(2, 3), vie: 0.6 }); }
      if (e.k === "pilier") { const E2 = ELEMENTS[e.el] || ELEMENTS.physique; for (let i = 0; i < 60; i++) ajouter({ x: e.x + rnd(-26, 26), y: SOL - rnd(0, 20), vx: rnd(-20, 20), vy: rnd(-520, -220), couleur: i % 3 ? E2.c1 : "#ffffff", taille: rnd(3, 7), vie: rnd(0.4, 0.8), forme: e.el === "terre" ? "roche" : "rond", g: e.el === "terre" ? 600 : 0, add: e.el !== "terre" }); etat.secousse = Math.max(etat.secousse, 7); }
      if (e.k === "impact") { eclat(e.x, e.y, e.el, e.fort ? 1.4 : 1); nombre(e.x, e.y - 20, e.txt, e.fort ? "#ffd84a" : "#ff6a6a", e.fort); if (e.fort) etat.secousse = Math.max(etat.secousse, 8); }
      else if (e.k === "garde") { anneau(e.x, e.y, "#9adcff", 30); nombre(e.x, e.y - 20, "Garde", "#9adcff"); }
      else if (e.k === "banniere") etat.banniere = { txt: e.txt, sous: e.sous || "", vie: e.vie || 1.4, age: 0, couleur: e.couleur || "#f5d08a" };
      else if (e.k === "flash") etat.flash = Math.max(etat.flash, e.v || 0.6);
      else if (e.k === "finish") finishEffet(e);
      else if (e.k === "fcoup" || e.k === "ffige" || e.k === "ffinal") finEvenement(e);
      else if (e.k === "lancer") for (let i = 0; i < 10; i++) ajouter({ x: e.x, y: e.y, vx: rnd(-60, 60), vy: rnd(-80, 20), couleur: (ELEMENTS[e.el] || ELEMENTS.physique).c1, taille: rnd(2, 5), vie: 0.5 });
    }
    function ajouter(p) { if (parts.length < 600) parts.push({ vx: 0, vy: 0, g: 0, taille: 3, vie: 0.6, age: 0, add: true, forme: "rond", rot: 0, vr: 0, ...p }); }
    function anneau(x, y, couleur, rmax) { parts.push({ x, y, anneau: true, r: 4, rmax, vie: 0.35, age: 0, couleur }); }
    function eclat(x, y, el, force = 1) {
      const E2 = ELEMENTS[el] || ELEMENTS.physique;
      for (let i = 0; i < 22 * force; i++) {
        const a = rnd(0, 6.28), v = rnd(60, 220) * force, p = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, couleur: Math.random() < 0.5 ? E2.c1 : E2.c2, taille: rnd(2, 5), vie: rnd(0.3, 0.7) };
        if (el === "sang" || el === "eau") Object.assign(p, { g: 500, add: el === "eau", forme: "goutte" });
        else if (el === "feu") Object.assign(p, { g: -200, taille: rnd(3, 7) });
        else if (el === "glace") Object.assign(p, { forme: "eclat", add: false, vr: rnd(-8, 8) });
        else if (el === "ombre") Object.assign(p, { forme: "fumee", add: false, taille: rnd(8, 14), vx: p.vx * 0.4, vy: p.vy * 0.4 });
        else if (el === "arcane" || el === "lumiere") Object.assign(p, { forme: "etoile", vr: rnd(-6, 6) });
        else Object.assign(p, { forme: "trait", rot: a, vie: 0.25 });
        ajouter(p);
      }
      anneau(x, y, E2.glow, 50 * force);
    }
    function nombre(x, y, txt, couleur, gros) { textes.push({ x: x + rnd(-6, 6), y, txt, couleur, gros, age: 0, vie: 1 }); }

    // ---- simulation (60 images/s) ----
    const debutRound = () => {
      equipes.forEach((eq, i) => { actifs[i] = 0; J[i] = eq[0]; eq.forEach((p) => Object.assign(p, { x: i ? 460 : 180, y: SOL, vx: 0, vy: 0, face: i ? -1 : 1, pv: p.pvMax, pvAff: p.pvMax, etat: "garde", t: 0, coup: null, stun: 0, invuln: 0, recharge: 0, sigRecharge: 0, combo: 0, comboT: 0, hist: [], tagCd: 0 })); });
      etat.projectiles = []; etat.chrono = 60 * 60; etat.phase = "intro"; etat.phaseT = 0; etat.acheve = null; etat.finish = null; etat.finishFx = null; J.forEach((q) => { q.poseF = null; q.rotF = 0; });
      evt({ k: "banniere", txt: `Round ${etat.round}`, sous: etat.round === 1 ? `📍 ${opts.lieu || (ARENES[opts.arene] || ARENES.cathedrale).nom}` : `${J[0].c.nom} contre ${J[1].c.nom}`, vie: 1.5 });
    };
    function changerEtat(p, e) { p.etat = e; p.t = 0; }
    function attaquer(p, nom) { p.tampon = null; p.coup = { ...COUPS[nom], nom }; p.touche = false; changerEtat(p, "attaque"); evt({ k: "son", n: "vent" }); }
    // un coup raté laisse ouvert : on récupère plus lentement (marteler ne paie plus)
    const PENALITE_RATE = { coup: 7, bas: 7, fort: 14, balayage: 16, lanceur: 18, aerien: 0 };
    function ia(p, o) {
      const n = { facile: [26, 0.15, 0.25], normal: [14, 0.45, 0.5], difficile: [7, 0.75, 0.8] }[opts.niveau] || [14, 0.45, 0.5];
      const c = cmd[p.cote];
      c.g = c.d = c.h = c.b = 0;
      if (etat.acheve) { if (etat.acheve.gagnant === p.cote && etat.acheve.t < 200) c.sup = 1; return; }
      p.iaT = (p.iaT || 0) - 1;
      const dist = Math.abs(o.x - p.x), devant = Math.sign(o.x - p.x) || 1;
      // se protéger si l'adversaire attaque
      if (o.etat === "attaque" && o.coup && !o.touche && o.t > o.coup.debut + o.coup.actif && dist < 110 && Math.random() < n[1]) { c.coup = 1; if (Math.random() < 0.5) { c.fort = 1; c.coup = 0; } return; }
      if (o.etat === "saut" && o.vy > -4 && dist < 130 && dist > 30 && p.etat !== "attaque" && Math.random() < n[1] * 0.35) { c.fort = 1; if (devant > 0) c.d = 1; else c.g = 1; return; }
      const menace = (o.etat === "attaque" && o.coup) || etat.projectiles.some((q) => q.camp !== p.cote && Math.abs(q.x - p.x) < 160);
      if (menace) { const id = o.etat === "attaque" ? o.coup : "proj"; if (p.iaVu !== id) { p.iaVu = id; p.iaGarde = Math.random() < n[1] * 1.3; } } else p.iaVu = null;
      if (menace && p.iaGarde) { if (devant > 0) c.g = 1; else c.d = 1; if (o.coup && o.coup.bas && o.etat === "attaque") c.b = 1; return; }
      if (dist < 62 && o.bloque && ["garde", "accroupi"].includes(o.etat) && Math.random() < n[1] * 0.08) { c.coup = 1; if (devant > 0) c.d = 1; else c.g = 1; return; }
      if (p.iaT > 0) { if (p.iaPlan === "avance") { if (devant > 0) c.d = 1; else c.g = 1; } if (p.iaPlan === "recule") { if (devant > 0) c.g = 1; else c.d = 1; } return; }
      p.iaT = n[0] + Math.floor(Math.random() * n[0]);
      if (p.super >= 100 && dist < 300 && Math.random() < n[2]) { c.sup = 1; return; }
      if (dist > 200) { p.iaPlan = Math.random() < 0.35 && p.recharge <= 0 ? "spe" : "avance"; if (p.iaPlan === "spe") c.spe = 1; return; }
      if (dist > 95) { p.iaPlan = Math.random() < 0.2 ? "saut" : "avance"; if (p.iaPlan === "saut") { c.h = 1; if (devant > 0) c.d = 1; else c.g = 1; } return; }
      const r = Math.random();
      p.iaPlan = "frappe";
      if (r < 0.32) c.coup = 1; else if (r < 0.5) c.fort = 1; else if (r < 0.6) { c.fort = 1; if (devant > 0) c.d = 1; else c.g = 1; } else if (r < 0.72) { c.b = 1; c.fort = 1; } else if (r < 0.85) p.iaPlan = "recule"; else { c.h = 1; c.coup = 1; }
    }
    function pas() {
      if (etat.gel > 0) { etat.gel--; return; }
      etat.phaseT++;
      if (etat.phase === "intro") { if (etat.phaseT === 70) evt({ k: "banniere", txt: "COMBAT !", vie: 0.8, couleur: "#ff6a4a" }); if (etat.phaseT > 90) etat.phase = "combat"; }
      if (etat.phase === "combat" && !entrainement && --etat.chrono <= 0) finRound(null);
      if (contreOrdi) ia(J[1], J[0]);
      if (entrainement) mannequin(J[1], J[0]);
      // relais (duo) : le partenaire qui attend récupère un peu de vie
      if (duo) equipes.forEach((eq, side) => eq.forEach((p) => { if (p !== J[side] && p.pv > 0 && p.pv < p.pvMax && etat.phase === "combat") p.pv = Math.min(p.pvMax, p.pv + 0.35); }));
      J.forEach((p) => { if (p.tagCd > 0) p.tagCd--; if (p.comboT > 0) p.comboT--; if (p.sigRecharge > 0) p.sigRecharge--; });
      // coup de grâce : Super pendant que l'adversaire est sonné (quel que soit le mouvement en cours)
      if (etat.acheve && !etat.finish && cmd[etat.acheve.gagnant].sup) { const g = J[etat.acheve.gagnant]; lancerFinish(g, J[1 - etat.acheve.gagnant]); }
      J.forEach((p, i) => majCombattant(p, J[1 - i], cmd[i]));
      majFinish();
      // séparer les corps
      const dx = J[1].x - J[0].x;
      if (Math.abs(dx) < 46 && Math.abs(J[0].y - J[1].y) < 80) { const push = (46 - Math.abs(dx)) / 2 * Math.sign(dx || 1); J[0].x -= push; J[1].x += push; }
      J.forEach((p) => (p.x = Math.max(34, Math.min(W_D - 34, p.x))));
      // projectiles
      for (let i = etat.projectiles.length - 1; i >= 0; i--) {
        const q = etat.projectiles[i]; q.x += q.vx; q.y += q.vy || 0; q.age++;
        const cible = J[1 - q.camp];
        if (q.y > SOL + 8) { evt({ k: "impact", x: q.x, y: SOL - 4, el: q.el, txt: "", fort: false }); etat.projectiles.splice(i, 1); continue; }
        const autre = !q.vy && etat.projectiles.find((o) => o !== q && !o.vy && o.camp !== q.camp && Math.abs(o.x - q.x) < 24);
        if (autre) { evt({ k: "impact", x: q.x, y: q.y, el: q.el, txt: "", fort: false }); etat.projectiles.splice(etat.projectiles.indexOf(autre), 1); etat.projectiles.splice(etat.projectiles.indexOf(q), 1); i = etat.projectiles.length; continue; }
        const dy = cible.y - q.y;
        if (Math.abs(cible.x - q.x) < (q.gros ? 40 : 30) && dy > -6 && dy < (q.bas ? 40 : 150) && cible.invuln <= 0 && !["ko", "sonne"].includes(cible.etat)) { toucher(J[q.camp], cible, { dmg: q.dmg, stun: 18, recul: 7, gain: 10, el: q.el, fort: true, bas: q.bas }, q.x); etat.projectiles.splice(i, 1); continue; }
        if (q.x < -40 || q.x > W_D + 40) etat.projectiles.splice(i, 1);
      }
      cmd.forEach((c) => (c.coup = c.fort = c.spe = c.sup = c.sig = c.tag = c.tap_h = c.tap_b = c.tap_g = c.tap_d = 0));
      if (etat.acheve) { etat.acheve.t--; if (etat.acheve.t <= 0 && !etat.finish) finRound(etat.acheve.gagnant, true); }
    }
    function majCombattant(p, o, c0) {
      const c = Object.assign({}, c0, { h: c0.h || c0.tap_h, b: c0.b || c0.tap_b, g: c0.g || c0.tap_g, d: c0.d || c0.tap_d });
      // un appui reste en mémoire 5 images : plus besoin d'appuyer pile au bon moment pour enchaîner
      if (c0.coup || c0.fort) p.tampon = { k: c0.fort ? "fort" : "coup", n: 5 }; else if (p.tampon && --p.tampon.n <= 0) p.tampon = null;
      if (p.tampon && !c.coup && !c.fort) c[p.tampon.k] = 1;
      const consommer = () => { p.tampon = null; };
      if (p.pousse) { p.x += p.pousse; p.pousse *= 0.8; if (Math.abs(p.pousse) < 0.2) p.pousse = 0; }
      p.t++; if (p.invuln > 0) p.invuln--; if (p.recharge > 0) p.recharge--;
      const actif = etat.phase === "combat" && !etat.fini;
      const versO = Math.sign(o.x - p.x) || p.face;
      // historique des directions (vers l'adversaire = « avant ») pour les manipulations ↓ ↘ →
      const avant = (versO > 0 && c.d) || (versO < 0 && c.g), recule = (versO > 0 && c.g) || (versO < 0 && c.d);
      p.hist.push((c.b ? "b" : "") + (avant ? "f" : recule ? "r" : "")); if (p.hist.length > 22) p.hist.shift();
      if ((versO > 0 && c0.tap_d) || (versO < 0 && c0.tap_g)) { p.tapsAvant.push(etat.phaseT); p.tapsAvant = p.tapsAvant.filter((x) => etat.phaseT - x < 16); }
      const quartDeCercle = () => { const h = p.hist; let i = h.length - 1, vu = 0; const ordre = ["f", "bf", "b"]; for (; i >= 0 && vu < 3; i--) if (h[i] === ordre[vu]) vu++; else if (vu === 0 && h[i] === "") continue; return vu >= 3; };
      const demandeSig = c.sig || (c.spe && quartDeCercle());
      const arriere = (versO > 0 && c.g) || (versO < 0 && c.d);
      // gravité
      if (!auSol(p) || p.vy < 0) { p.vy += 0.75; p.y += p.vy; p.x += p.vx; if (p.y >= SOL) { p.y = SOL; p.vy = 0; p.vx = 0; if (p.etat === "saut" || p.etat === "attaque" && p.coup && p.coup.haut) changerEtat(p, "garde"); if (p.etat === "envol") { changerEtat(p, "aterre"); p.jongle = 0; evt({ k: "chute", x: p.x }); } } }
      switch (p.etat) {
        case "ko": return;
        case "sonne": return;
        case "victoire": return;
        case "touche": p.x += p.recul || 0; p.recul *= 0.85; if (p.t >= p.stun) changerEtat(p, "garde"); return;
        case "garde_coup": p.x += p.recul || 0; p.recul *= 0.8; if (p.t >= p.stun) changerEtat(p, "garde"); return;
        case "envol": return;
        case "aterre": p.invuln = Math.max(p.invuln, 2); if (p.t > 46) { changerEtat(p, "garde"); p.invuln = 4; } return;
        case "magie": if (p.t === 12) { etat.projectiles.push({ x: p.x + p.face * 40, y: SOL - 86, vx: p.face * 6.5, camp: p.cote, el: p.c.element, dmg: Math.round(76 * p.attMul), age: 0 }); evt({ k: "lancer", x: p.x + p.face * 40, y: SOL - 86, el: p.c.element }); } if (p.t > 30) changerEtat(p, "garde"); return;
        case "super": superCoup(p, o); return;
        case "signature": majSignature(p, o); return;
        case "dash": p.x += p.face * (p.t < 8 ? 8 : 3) * p.vitesse; if (p.t > 12) changerEtat(p, "garde"); return;
        case "entree": if (auSol(p) && p.t > 4) changerEtat(p, "garde"); return;
        case "finish": return;
        case "saisie": {
          if (p.t === 5) {
            const prise = Math.abs(o.x - p.x) < 82 && auSol(o) && o.invuln <= 0 && saisissable(o);
            if (prise && o.etat === "saisie") { // les deux saisissent en même temps : dégagement
              const g = p.x < o.x ? p : o; g.pousse = -6; (g === p ? o : p).pousse = 6; [p, o].forEach((q) => { q.recul = 0; q.stun = 14; changerEtat(q, "garde_coup"); });
              evt({ k: "banniere", txt: "DÉGAGÉ !", vie: 0.6, couleur: "#9adcff" }); evt({ k: "garde", x: (p.x + o.x) / 2, y: p.y - 90 }); return;
            }
            if (prise) {
              p.touche = true; p.tient = true;
              if (p.saisieArriere) { const nx = p.x - p.face * 46; if (nx > 40 && nx < W_D - 40) { o.x = nx; } }
              toucher(p, o, { dmg: 110, stun: 0, recul: 0, gain: 14, el: "physique", chute: true, saisie: true }, (p.x + o.x) / 2);
              evt({ k: "banniere", txt: "PROJECTION !", vie: 0.6, couleur: "#ffd84a" });
            }
          }
          if (p.t > (p.tient ? 22 : 30)) { p.tient = false; changerEtat(p, "garde"); }
          return;
        }
        case "attaque": {
          const k = p.coup;
          if (p.t >= k.debut && p.t < k.debut + k.actif && !p.touche) {
            const dx = (o.x - p.x) * p.face;
            const enlair = o.etat === "envol";
            const portee = dx > 0 && dx < k.portee + 18 && Math.abs((o.y - (k.haut ? 30 : 0)) - p.y) < (enlair || (k.antiair && o.etat === "saut") ? 150 : 90);
            const saute = o.y < SOL - 40;
            if (portee && !(k.bas && saute && !enlair) && o.invuln <= 0 && !["ko", "aterre"].includes(o.etat) && !(enlair && (o.jongle || 0) >= 3)) { p.touche = true; toucher(p, o, { ...k, el: k.nom === "fort" ? p.c.element : "physique" }, o.x - p.face * 18); }
          }
          // combos : un coup qui touche peut s'enchaîner (annulation) sur un coup plus fort
          if (p.touche && auSol(p) && p.t >= k.debut + 1) {
            // après un lanceur réussi : on peut enchaîner (jonglage) ou sauter pour le poursuivre en l'air
            if (k.nom === "lanceur" && p.t >= k.debut + k.actif) { if (c.coup || c.fort) { attaquer(p, c.coup ? "coup" : "fort"); return; } if (c.h) { p.vy = -14.5; p.vx = p.face * 3.2 * p.vitesse; p.y -= 1; changerEtat(p, "saut"); evt({ k: "son", n: "saut" }); return; } }
            if (["coup", "bas"].includes(k.nom) && c.fort) { attaquer(p, c.b ? "balayage" : avant ? "lanceur" : "fort"); return; }
            if (["coup", "bas"].includes(k.nom) && c.coup && (p.chaine || 0) < 2) { p.chaine = (p.chaine || 0) + 1; attaquer(p, c.b ? "bas" : "coup"); p.chaine = p.chaine; return; }
            if (["coup", "bas", "fort", "lanceur"].includes(k.nom)) {
              if (demandeSig && p.sigRecharge <= 0) { lancerSignature(p, o); return; }
              if (c.spe && p.recharge <= 0) { p.recharge = 70; changerEtat(p, "magie"); return; }
              if (c.sup && p.super >= 100) { p.super = 0; changerEtat(p, "super"); return; }
            }
          }
          const recup = k.fin + (p.touche ? 0 : PENALITE_RATE[k.nom] || 0);
          if (p.t >= k.debut + k.actif + recup && (auSol(p) || !k.haut)) { p.chaine = 0; changerEtat(p, auSol(p) ? (c.b ? "accroupi" : "garde") : "saut"); }
          return;
        }
      }
      if (!actif) { if (auSol(p)) changerEtat(p, p.etat === "garde" ? "garde" : "garde"); return; }
      // achever l'adversaire sonné
      if (etat.acheve && etat.acheve.gagnant === p.cote && c.sup && !etat.finish) { lancerFinish(p, o); return; }
      if (etat.acheve) { if (auSol(p)) changerEtat(p, "garde"); return; }
      if (auSol(p) && ["garde", "marche", "accroupi", "bloque"].includes(p.etat)) {
        p.face = versO;
        if (c.tag && duo && p.tagCd <= 0) { if (relais(p.cote)) return; }
        if (c.sup && p.super >= 100) { p.super = 0; changerEtat(p, "super"); return; }
        if (demandeSig && p.sigRecharge <= 0) { lancerSignature(p, o); return; }
        if (c.spe && p.recharge <= 0) { p.recharge = 70; changerEtat(p, "magie"); return; }
        if (p.tapsAvant.length >= 2 && !c.b) { p.tapsAvant = []; changerEtat(p, "dash"); evt({ k: "son", n: "dash" }); return; }
        if (c.coup && !c.b && (avant || recule) && Math.abs(o.x - p.x) < 66 && auSol(o) && saisissable(o)) { consommer(); p.saisieArriere = recule; p.touche = false; p.tient = false; changerEtat(p, "saisie"); evt({ k: "son", n: "vent" }); return; }
        if (c.coup) { attaquer(p, c.b ? "bas" : "coup"); return; }
        if (c.fort) { attaquer(p, c.b ? "balayage" : avant && !recule ? "lanceur" : "fort"); return; }
        if (c.h) { p.vy = -14.5; p.vx = (c.d ? 3.6 : c.g ? -3.6 : 0) * p.vitesse; p.y -= 1; changerEtat(p, "saut"); evt({ k: "son", n: "saut" }); return; }
        if (c.b) { if (p.etat !== "accroupi") changerEtat(p, "accroupi"); p.bloque = arriere; return; }
        p.bloque = arriere;
        if (c.g || c.d) { p.x += (c.d ? 1 : -1) * (arriere ? 2.6 : 3.4) * p.vitesse; if (p.etat !== "marche") changerEtat(p, "marche"); }
        else if (p.etat !== "garde") changerEtat(p, "garde");
      } else if (p.etat === "saut" && (c.coup || c.fort)) attaquer(p, "aerien");
    }
    function saisissable(o) { return ["garde", "marche", "accroupi", "saisie"].includes(o.etat) || (o.etat === "attaque" && o.coup && o.t < o.coup.debut); }
    function toucher(a, d, k, xImpact) {
      if (["sonne", "ko"].includes(d.etat) || etat.acheve) return;
      const y = d.y - (k.bas ? 30 : 92);
      // anti-aérien : le lanceur passe sous les attaques sautées pendant son démarrage
      if (k.haut && d.etat === "attaque" && d.coup && d.coup.antiair && d.t <= d.coup.debut + d.coup.actif) return;
      const garde = !k.saisie && d.bloque && auSol(d) && ["garde", "marche", "accroupi", "garde_coup"].includes(d.etat) && !(k.bas && d.etat !== "accroupi") && !(k.haut && d.etat === "accroupi");
      if (garde) {
        const chip = Math.round(k.dmg * a.attMul * 0.12);
        d.pv = Math.max(1, d.pv - chip); d.recul = -d.face * 3.5; d.stun = k.bstun || 14; changerEtat(d, "garde_coup");
        if (d.x < 70 || d.x > W_D - 70) a.pousse = -a.face * 3.5;
        a.super = Math.min(100, a.super + k.gain * 0.5); d.super = Math.min(100, d.super + 4);
        evt({ k: "garde", x: xImpact, y }); etat.gel = 3; return;
      }
      if (d.etat === "aterre") return;
      const contre = d.etat === "attaque" && d.coup && d.t < (d.coup.debut || 0) + (d.coup.actif || 0);
      if (contre) evt({ k: "banniere", txt: "CONTRE !", vie: 0.6, couleur: "#ff9a3a" });
      const enchaine = ["touche", "envol"].includes(d.etat);
      a.combo = enchaine && a.comboT > 0 ? a.combo + 1 : 1; if (a.combo === 1) a.comboDmg = 0;
      const dmg = Math.round(k.dmg * a.attMul * (1 - d.defRed) * Math.max(0.45, 1 - 0.1 * (a.combo - 1)) * (contre ? 1.25 : 1));
      a.comboDmg += dmg; a.comboT = 70; a.comboAff = a.combo;
      if (a.combo >= 2) evt({ k: "son", n: "combo", f: Math.min(8, a.combo) });
      d.pv = Math.max(0, d.pv - dmg); d.blanc = 1;
      if (entrainement && d.cote === 1 && d.pv <= 0) d.pv = d.pvMax;
      a.super = Math.min(100, a.super + k.gain); d.super = Math.min(100, d.super + 5);
      evt({ k: "impact", x: xImpact, y, el: k.el || "physique", txt: "-" + dmg, fort: dmg > 80 });
      etat.gel = dmg > 80 ? 7 : 4;
      if (d.pv <= 0) { ko(a, d); return; }
      d.face = Math.sign(a.x - d.x) || d.face;
      if (d.x < 70 || d.x > W_D - 70) a.pousse = -a.face * Math.max(2.5, (k.recul || 3) * 0.8);
      if (k.saisie) { d.vy = -9; d.vx = -d.face * 4.2; d.y -= 1; d.jongle = 3; changerEtat(d, "envol"); }
      else if (k.lance && auSol(d) && d.etat !== "envol") { d.vy = -13; d.vx = -d.face * 0.4; d.y -= 1; d.jongle = 0; changerEtat(d, "envol"); evt({ k: "son", n: "fort" }); }
      else if (!auSol(d) || d.etat === "envol") { d.jongle = (d.jongle || 0) + 1; d.vy = Math.min(d.vy, d.jongle >= 3 ? -4 : -7); d.vx = -d.face * 2.4; d.y -= 1; changerEtat(d, "envol"); }
      else if (k.chute) { d.vy = k.bas ? -5 : -8; d.vx = -d.face * (k.bas ? 1.5 : 3.5); d.y -= 1; d.jongle = 3; changerEtat(d, "envol"); }
      else if (contre && dmg > 70) { d.vy = -7; d.vx = -d.face * 4; d.y -= 1; d.jongle = 2; changerEtat(d, "envol"); }
      else { d.stun = k.stun + (contre ? 8 : 0); d.recul = -d.face * k.recul * 0.9; d.toucheBas = !!k.bas || d.etat === "accroupi"; changerEtat(d, "touche"); }
    }
    function lancerSignature(p, o) {
      p.sigRecharge = 200; p.touche = false; p.face = Math.sign(o.x - p.x) || p.face; changerEtat(p, "signature");
      evt({ k: "banniere", txt: p.c.sigNom, sous: "★ SIGNATURE", vie: 0.9, couleur: (ELEMENTS[p.c.element] || ELEMENTS.physique).glow }); evt({ k: "son", n: "signature" });
    }
    function majSignature(p, o) {
      const t = p.t, E = p.c.element, dmg = Math.round(92 * p.attMul);
      const coup = (k) => { if (!p.touche && o.invuln <= 0 && !["ko", "sonne"].includes(o.etat)) { p.touche = true; toucher(p, o, { dmg, stun: 24, recul: 8, gain: 12, el: E, fort: true, ...k }, o.x - p.face * 14); } };
      switch (p.c.sig) {
        case "eventail": if (t === 10) [-1.4, 0, 1.4].forEach((vy) => etat.projectiles.push({ x: p.x + p.face * 40, y: SOL - 92, vx: p.face * 7.5, vy, camp: p.cote, el: E, dmg: Math.round(dmg * 0.45), age: 0, forme: "carte" })); if (t > 28) changerEtat(p, "garde"); break;
        case "teleport": if (t === 1) { p.invuln = 28; evt({ k: "fumee", x: p.x, y: p.y }); } if (t === 12) { const dir = Math.sign(o.x - p.x) || 1; let nx = o.x + dir * 52; if (nx < 40 || nx > W_D - 40) nx = o.x - dir * 52; p.x = nx; p.face = Math.sign(o.x - p.x) || p.face; evt({ k: "fumee", x: p.x, y: p.y }); } if (t >= 16 && t <= 22 && Math.abs(o.x - p.x) < 95) coup({ chute: true }); if (t > 36) changerEtat(p, "garde"); break;
        case "vague": if (t === 14) etat.projectiles.push({ x: p.x + p.face * 34, y: SOL - 20, vx: p.face * 5.5, vy: 0, camp: p.cote, el: E, dmg: Math.round(dmg * 0.85), age: 0, forme: "vague", gros: true, bas: true }); if (t > 32) changerEtat(p, "garde"); break;
        case "pluie": if (t === 10) for (let i = 0; i < 5; i++) etat.projectiles.push({ x: o.x + (i - 2) * 26, y: -30 - i * 34, vx: 0, vy: 8, camp: p.cote, el: E, dmg: Math.round(dmg * 0.3), age: 0, forme: "pluie" }); if (t > 30) changerEtat(p, "garde"); break;
        case "colonne": if (t === 6) { p.cibleX = o.x; evt({ k: "marque", x: o.x, el: E }); } if (t === 26) { evt({ k: "pilier", x: p.cibleX, el: E }); if (Math.abs(o.x - p.cibleX) < 44) coup({ chute: true, dmg: Math.round(dmg * 1.1) }); } if (t > 40) changerEtat(p, "garde"); break;
        default: if (t >= 6 && t < 22) { p.x += p.face * 10 * p.vitesse; p.x = Math.max(34, Math.min(W_D - 34, p.x)); if (Math.abs(o.x - p.x) < 52) coup({ chute: true }); if (t % 2) ajouter({ x: p.x - p.face * 20, y: p.y - rnd(30, 120), vx: -p.face * 200, vy: 0, couleur: (ELEMENTS[E] || ELEMENTS.physique).c1, forme: "trait", taille: 4, vie: 0.25 }); } if (t > 30) changerEtat(p, "garde");
      }
    }
    // mannequin d'entraînement : immobile, ou qui se protège
    function mannequin(p, o) {
      const c = cmd[1]; c.g = c.d = c.h = c.b = 0;
      if (opts.mannequin === "garde") { if (o.x < p.x) c.d = 1; else c.g = 1; }
      if (p.etat === "garde" && p.t > 90 && p.pv < p.pvMax) p.pv = p.pvMax;
      J[0].super = Math.min(100, J[0].super + 0.25);
    }
    function superCoup(p, o) {
      if (p.t === 1) { etat.gel = 30; evt({ k: "banniere", txt: p.c.super, sous: `SUPER — ${p.c.nom}`, vie: 1.6, couleur: (ELEMENTS[p.c.element] || ELEMENTS.physique).glow }); evt({ k: "flash", v: 0.5 }); }
      if (p.t >= 8 && p.t <= 40 && p.t % 8 === 0) {
        const devant = (o.x - p.x) * p.face > 0;
        if (devant && o.invuln <= 0 && !["ko"].includes(o.etat)) toucher(p, o, { dmg: 52, stun: 20, recul: 4, gain: 0, el: p.c.element, fort: true }, o.x - p.face * 10);
      }
      if (p.t > 54) changerEtat(p, "garde");
    }
    function partenaireVivant(side) { return equipes[side].some((p) => p !== J[side] && p.pv > 0); }
    function relais(side, force) {
      const eq = equipes[side], idx = actifs[side], r = eq[1 - idx], old = J[side];
      if (!r || r.pv <= 0) return false;
      actifs[side] = 1 - idx; J[side] = r;
      Object.assign(r, { x: Math.max(40, Math.min(W_D - 40, old.x)), y: SOL - 170, vy: 2, vx: 0, face: old.face, etat: "entree", t: 0, invuln: force ? 60 : 20, tagCd: 150, coup: null, stun: 0, combo: 0 });
      old.etat = "attente"; old.tagCd = 150;
      evt({ k: "banniere", txt: `⇄ ${r.c.nom}`, vie: 0.9, couleur: (ELEMENTS[r.c.element] || ELEMENTS.physique).glow }); evt({ k: "son", n: "tag" });
      return true;
    }
    function ko(a, d) {
      if (duo && partenaireVivant(d.cote)) {
        changerEtat(d, "ko"); d.vy = -8; d.vx = -d.face * 4; d.y -= 1; etat.ralenti = 40;
        evt({ k: "banniere", txt: `${d.c.nom} est K.O.`, vie: 1.2, couleur: "#ff6a6a" }); SON.jouer("ko");
        setTimeout(() => { if (vivante && !etat.fini) relais(d.cote, true); }, 1100);
        return;
      }
      const decisif = etat.victoires[a.cote] + 1 >= ROUNDS;
      if (decisif && opts.mode !== "aucun") {
        // ACHÈVE-LE !
        d.pv = 0; changerEtat(d, "sonne"); etat.acheve = { gagnant: a.cote, t: 60 * 4 };
        evt({ k: "banniere", txt: "ACHÈVE-LE !", sous: "Appuie sur Super", vie: 2.4, couleur: "#ff2a3a" });
        etat.ralenti = 30;
        return;
      }
      changerEtat(d, "ko"); d.vy = -8; d.vx = -d.face * 4; d.y -= 1;
      etat.ralenti = 70; evt({ k: "banniere", txt: "K.O.", vie: 1.6, couleur: "#ff3a3a" });
      setTimeout(() => finRound(a.cote), 1700);
    }
    // ===== Coup de grâce : une petite cinématique =====
    const FIN = { ouv: 40, emprise: 100, rafale: 184, fige: 208, fin: 310 };
    const NOMS_FINISH_THEME = { sceaux: "Sceau d'exécution", cartes: "Dernière main", metamorphose: "Forme ultime", illusion: "Mille reflets", temps: "Fin des temps", gravite: "Singularité", invocation: "Appel des abysses", necro: "Danse macabre", telekinesie: "Écrasement psychique", son: "Requiem", espace: "Faille finale", mots: "Dernier mot" };
    const NOMS_FINISH = { sang: "Festin écarlate", feu: "Bûcher infernal", glace: "Tombeau de glace", foudre: "Jugement de la foudre", lumiere: "Colonne céleste", ombre: "Étreinte du néant", nature: "Étreinte des ronces", poison: "Dernier venin", eau: "Abysse sans fond", vent: "Ouragan final", terre: "Tombe de pierre", arcane: "Sceau final", physique: "Coup fatal" };
    const POSES_RAFALE = ["poing", "pied", "uppercut", "poing", "aerien", "pied", "uppercut"];
    function lancerFinish(p, o) {
      const th = p.c.theme || p.c.element;
      const nom = p.c.finish || (p.c.ulti && p.c.ulti.nom) || NOMS_FINISH_THEME[th] || NOMS_FINISH[th] || NOMS_FINISH[p.c.element] || "Coup de grâce";
      p.face = Math.sign(o.x - p.x) || p.face;
      const pal = p.c.palFinish || null, el = pal ? "finish" + p.cote : p.c.element;
      if (pal) ELEMENTS[el] = pal;
      etat.finish = { t: 0, el, nom, theme: th, camp: p.cote, dir: p.face };
      changerEtat(p, "finish"); changerEtat(o, "sonne"); o.face = -p.face; p.poseF = "special"; o.poseF = null; o.rotF = 0; etat.ralenti = 0;
      evt({ k: "finish", camp: p.cote, el, pal, theme: th, nom, ulti: p.c.ulti ? p.c.ulti.nom : "", desc: p.c.ulti ? p.c.ulti.description : "" });
    }
    function majFinish() {
      const F = etat.finish; if (!F) return;
      const t = ++F.t, p = J[F.camp], o = J[1 - F.camp], bord = (x) => Math.max(40, Math.min(W_D - 40, x));
      if (t <= FIN.ouv) { const cx = Math.max(160, Math.min(W_D - 160, o.x)); o.x += (cx - o.x) * 0.12; p.x += (o.x - F.dir * 110 - p.x) * 0.12; p.y = SOL; }
      if (t < FIN.emprise) { if (F.theme === "gravite" || F.theme === "telekinesie") o.y = SOL - 56 * Math.min(1, Math.max(0, (t - FIN.ouv) / 50)); else o.y = SOL; o.vy = 0; p.vy = 0; }
      if (t === FIN.emprise - 20) evt({ k: "son", n: "signature" });
      if (t >= FIN.emprise && t < FIN.rafale) {
        const i = Math.floor((t - FIN.emprise) / 12), l = (t - FIN.emprise) % 12;
        if (l === 0) {
          const cote = i % 2 ? 1 : -1;
          p.x = bord(o.x + cote * F.dir * -54); p.face = Math.sign(o.x - p.x) || 1; o.face = -p.face;
          p.poseF = POSES_RAFALE[i % POSES_RAFALE.length];
          evt({ k: "fcoup", x: o.x, y: o.y - 84, n: i + 1, el: F.el, depuis: p.x });
        }
        o.poseF = l < 6 && i % 2 ? "envol" : "touche"; o.rotF = (i % 2 ? 0.3 : -0.18) * o.face;
        o.y = SOL - Math.min(64, 12 + i * 9) - Math.sin(l / 12 * Math.PI) * 7; o.vy = 0;
        p.y = POSES_RAFALE[i % POSES_RAFALE.length] === "aerien" ? SOL - 46 : SOL; p.vy = 0;
      }
      if (t === FIN.rafale) { p.x = bord(o.x + F.dir * 84); p.face = F.dir; p.poseF = "finish"; p.y = SOL; o.poseF = "touche"; o.rotF = 0; evt({ k: "ffige", x: o.x, y: o.y - 84, el: F.el }); }
      if (t > FIN.rafale && t < FIN.fige) { o.vy = 0; p.vy = 0; p.y = SOL; }
      if (t === FIN.fige) { o.poseF = null; o.rotF = 0; o.face = -F.dir; changerEtat(o, "ko"); o.vy = -10; o.vx = F.dir * 3.4; o.y -= 1; evt({ k: "ffinal", x: o.x, y: o.y - 84, el: F.el, theme: F.theme }); }
      if (t === FIN.fin) { p.poseF = null; finRound(F.camp, false, true); }
    }
    // ----- effets (hôte et invité, au rythme de l'horloge) -----
    const hasard = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const lisse = (k) => k * k * (3 - 2 * k);
    const ageF = (fx) => (performance.now() - fx.t0) / 1000 * 60;
    const prog = (a, d, f) => Math.max(0, Math.min(1, (a - d) / (f - d)));
    function finishEffet(e) {
      if (e.pal && e.el) ELEMENTS[e.el] = e.pal;
      const v = J[1 - e.camp];
      etat.finishFx = { t0: performance.now(), theme: e.theme || e.el, el: e.el, nom: e.nom, ulti: e.ulti || "", desc: e.desc || "", camp: e.camp, coups: 0, cx: v.x, cy: SOL - 105, dirW: Math.sign(v.x - J[e.camp].x) || 1 };
      etat.secousse = 6; etat.flash = 0.35;
    }
    function finEvenement(e) {
      const fx = etat.finishFx, E2 = ELEMENTS[e.el] || ELEMENTS.physique;
      if (e.k === "fcoup") {
        if (fx) { fx.coups = e.n; fx.coupT = performance.now(); fx.coupA = hasard(e.n * 7) * 6.28; }
        eclat(e.x, e.y, e.el, 1.3); anneau(e.x, e.y, E2.glow, 50); SON.jouer(e.n % 2 ? "fort" : "coup"); if (e.n >= 3) SON.jouer("combo", Math.min(8, e.n));
        for (let i = 0; i < 8; i++) ajouter({ x: e.depuis + (e.x - e.depuis) * (i / 8), y: e.y + rnd(-10, 10), couleur: E2.glow, forme: "trait", taille: 3, vie: 0.25 });
        etat.secousse = Math.max(etat.secousse, 7); etat.flash = Math.max(etat.flash, 0.12);
      }
      if (e.k === "ffige") { SON.jouer("vent"); SON.jouer("signature"); }
      if (e.k === "ffinal") {
        SON.jouer("ko"); SON.jouer("fort"); etat.secousse = 16; etat.flash = 0.8;
        eclat(e.x, e.y, e.el, 3); anneau(e.x, SOL, E2.glow, 160); anneau(e.x, e.y, "#ffffff", 120);
        const th = e.theme;
        for (let i = 0; i < 46; i++) {
          const a = rnd(0, 6.28), sp = rnd(120, 460);
          const forme = th === "cartes" ? "carte" : ["sceaux", "glace", "temps", "espace", "mots", "illusion"].includes(th) ? "eclat" : th === "sang" ? "goutte" : th === "terre" || th === "gravite" ? "roche" : th === "feu" ? "rond" : "eclat";
          ajouter({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 420, couleur: forme === "carte" ? "#f4ead0" : i % 3 ? E2.c1 : "#ffffff", forme, vr: rnd(-12, 12), taille: rnd(3, 7), vie: rnd(0.7, 1.3), add: forme !== "carte" && forme !== "roche" });
        }
      }
    }
    // caméra : zoom sur la scène pendant le coup de grâce
    function cameraFinish() {
      const fx = etat.finishFx; if (!fx) return;
      const a = ageF(fx); if (a > FIN.fin + 20) { etat.finishFx = null; return; }
      const v = J[1 - fx.camp], w = J[fx.camp];
      const z = 1 + 0.3 * lisse(prog(a, 0, 34)) + 0.1 * lisse(prog(a, FIN.rafale, FIN.fige)) - 0.4 * lisse(prog(a, FIN.fige + 10, FIN.fige + 70));
      const cible = a < FIN.emprise ? (v.x + w.x) / 2 : v.x;
      fx.cx += (cible - fx.cx) * 0.08; fx.cy += ((a < FIN.fige ? Math.min(SOL - 125, v.y - 110) : SOL - 130) - fx.cy) * 0.08;
      const cx = Math.max(W_D / 2 / z, Math.min(W_D - W_D / 2 / z, fx.cx)), cy = Math.max(H_D / 2 / z, Math.min(H_D - H_D / 2 / z, fx.cy));
      ctx.translate(W_D / 2, H_D / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
    }
    // --- petits dessins réutilisables ---
    function sceau(cx, cy, r, rot, col, al, aplati = 1) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, aplati); ctx.rotate(rot); ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 0, 7); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i <= 5; i++) { const an = i * 4 * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(an) * r * 0.76, Math.sin(an) * r * 0.76); } ctx.stroke();
      for (let i = 0; i < 16; i++) { ctx.save(); ctx.rotate(i * Math.PI / 8); ctx.fillRect(r * 0.8, -1.5, r * (i % 2 ? 0.08 : 0.14), 3); ctx.restore(); }
      ctx.restore();
    }
    function tentacules(x, y, s, a, n, couleur, bord, feuilles) {
      ctx.save(); ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const bx = x + (i - (n - 1) / 2) * 26, ex = x + Math.sin(i * 2.1 + a * 0.06) * 26, ey = y + ((i % 3) - 1) * 26;
        const tx = bx + (ex - bx) * s, ty = SOL + (ey - SOL) * s, c1x = bx + (i % 2 ? 50 : -50) * s, c1y = SOL - 60 * s;
        for (const [lw, col] of [[9, bord], [5, couleur]]) { ctx.strokeStyle = col; ctx.lineWidth = lw * (0.6 + 0.4 * s); ctx.beginPath(); ctx.moveTo(bx, SOL); ctx.quadraticCurveTo(c1x, c1y, tx, ty); ctx.stroke(); }
        if (feuilles && s > 0.3) { ctx.fillStyle = "#7fe07a"; for (let k = 1; k < 4; k++) { const q = k / 4; const lx = (1 - q) * (1 - q) * bx + 2 * (1 - q) * q * c1x + q * q * tx, ly = (1 - q) * (1 - q) * SOL + 2 * (1 - q) * q * c1y + q * q * ty; ctx.beginPath(); ctx.ellipse(lx + 5, ly, 6, 3, 0.6, 0, 7); ctx.fill(); } }
      }
      ctx.restore();
    }
    function eclairCiel(x0, y0, x1, y1, graine, larg, col) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const n = 14, pts = []; for (let i = 0; i <= n; i++) { const q = i / n; pts.push([x0 + (x1 - x0) * q + (i && i < n ? (hasard(graine * 31 + i) - 0.5) * 10 * larg : 0), y0 + (y1 - y0) * q]); }
      const coeur = (ELEMENTS[(etat.finishFx || {}).el] || {}).c1 || "#ffffff";
      for (const [lw, c, blur, al] of [[larg * 3.6, col, 34, 0.7], [larg * 1.6, col, 14, 0.9], [larg * 0.7, coeur, 8, 1]]) {
        ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.shadowColor = col; ctx.shadowBlur = blur; ctx.globalAlpha = al;
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        for (let b = 0; b < 3; b++) { const k = 3 + Math.floor(hasard(graine + b * 7) * 8); let [bx, by] = pts[k]; ctx.lineWidth = lw * 0.4; ctx.beginPath(); ctx.moveTo(bx, by); const sens = hasard(graine + b) > 0.5 ? 1 : -1; for (let j = 0; j < 4; j++) { bx += (hasard(graine + b * 13 + j) - 0.3) * 30 * sens; by += 20; ctx.lineTo(bx, by); } ctx.stroke(); }
      }
      // point d'impact
      const g = ctx.createRadialGradient(x1, y1, 2, x1, y1, larg * 9); g.addColorStop(0, "#ffffff"); g.addColorStop(0.3, col); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.8; ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x1, y1, larg * 9, 0, 7); ctx.fill();
      ctx.restore();
    }
    // derrière les combattants
    function finArriere() {
      const fx = etat.finishFx; if (!fx) return;
      const a = ageF(fx), E2 = ELEMENTS[fx.el] || ELEMENTS.physique, v = J[1 - fx.camp], w = J[fx.camp], x = v.x, y = v.y - 84;
      const s = lisse(prog(a, FIN.ouv, FIN.emprise)), sortie = 1 - prog(a, FIN.fige + 30, FIN.fin - 20);
      ctx.save();
      ctx.fillStyle = `rgba(4,2,12,${0.8 * Math.min(1, a / 20) * sortie})`; ctx.fillRect(-W_D, -H_D, W_D * 3, H_D * 3);
      const g = ctx.createRadialGradient(x, SOL, 5, x, SOL, 160); g.addColorStop(0, E2.glow); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.35 * s * sortie; ctx.fillStyle = g; ctx.fillRect(x - 170, SOL - 120, 340, 160); ctx.globalAlpha = sortie;
      const th = fx.theme;
      if (th === "temps") {
        const r = 70 + 50 * s; ctx.save(); ctx.translate(x, y - 10); ctx.globalAlpha = 0.85 * s * sortie; ctx.strokeStyle = E2.c2; ctx.lineWidth = 3; ctx.shadowColor = E2.glow; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); ctx.fillStyle = E2.c1; ctx.font = `700 ${Math.round(r / 7)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"].forEach((n, i) => { const an = i * Math.PI / 6 - Math.PI / 2; ctx.fillText(n, Math.cos(an) * r * 0.82, Math.sin(an) * r * 0.82); });
        const stop = Math.min(a, FIN.emprise); ctx.lineCap = "round";
        [[stop * 0.35, r * 0.7, 3], [stop * 0.05, r * 0.45, 5]].forEach(([an, l, lw]) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(an) * l, -Math.cos(an) * l); ctx.stroke(); });
        ctx.restore();
      } else if (th === "sang") {
        ctx.save(); ctx.globalAlpha = s * sortie; const lg = ctx.createRadialGradient(x, y - 120, 10, x, y - 120, 110); lg.addColorStop(0, "#ff3a4a"); lg.addColorStop(0.55, "#a00018"); lg.addColorStop(1, "rgba(80,0,10,0)"); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y - 120, 110, 0, 7); ctx.fill(); ctx.restore();
      } else if (th === "gravite") {
        ctx.save(); ctx.globalAlpha = s * sortie; const r = 18 + 26 * s, cy = y - 90;
        ctx.strokeStyle = E2.c1; ctx.lineWidth = 3; ctx.shadowColor = E2.glow; ctx.shadowBlur = 20;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(x, cy, r * (1.8 + k * 0.5), r * (0.45 + k * 0.1), a * 0.02 * (k % 2 ? -1 : 1), 0, 7); ctx.stroke(); }
        ctx.shadowBlur = 0; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, cy, r, 0, 7); ctx.fill();
        for (let i = 0; i < 10; i++) { const an = a * 0.04 + i * 0.63, rr = 70 + 30 * hasard(i); ctx.fillStyle = "#6a5a7a"; ctx.fillRect(x + Math.cos(an) * rr - 4, cy + 70 + Math.sin(an) * rr * 0.4 - 4 - 60 * s * hasard(i + 3), 8, 7); }
        ctx.restore();
      } else if (th === "invocation") {
        sceau(w.x, SOL, 70, a * 0.03, E2.glow, s * sortie, 0.28);
        ctx.save(); ctx.globalAlpha = 0.45 * s * sortie; ctx.fillStyle = E2.c2; ctx.shadowColor = E2.glow; ctx.shadowBlur = 30; const hx = w.x - fx.dirW * 40, hy = SOL - 260 * s + 40;
        ctx.beginPath(); ctx.ellipse(hx, hy + 120, 90, 120, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(hx, hy, 44, 0, 7); ctx.fill();
        ctx.globalAlpha = s * sortie; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(hx - 14, hy - 4, 7, 3, 0, 0, 7); ctx.ellipse(hx + 14, hy - 4, 7, 3, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = E2.glow; ctx.lineWidth = 6; ctx.lineCap = "round"; const bx = hx + fx.dirW * 70, by = hy + 60; ctx.beginPath(); ctx.moveTo(hx + fx.dirW * 40, hy + 50); ctx.quadraticCurveTo(bx, by - 30, x - fx.dirW * 20, y - 10 * s); ctx.stroke();
        ctx.restore();
      } else if (th === "metamorphose") {
        ctx.save(); ctx.globalAlpha = 0.85 * s * sortie; const bx = w.x - fx.dirW * 50, by = SOL - 190 * s - 10;
        ctx.fillStyle = "#14060c"; ctx.strokeStyle = E2.glow; ctx.lineWidth = 3; ctx.shadowColor = E2.glow; ctx.shadowBlur = 30; ctx.beginPath(); ctx.ellipse(bx, by + 80, 95 * s, 140 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 50 * s, by - 10); ctx.lineTo(bx - 34 * s, by - 80 * s); ctx.lineTo(bx - 14 * s, by - 20); ctx.moveTo(bx + 50 * s, by - 10); ctx.lineTo(bx + 34 * s, by - 80 * s); ctx.lineTo(bx + 14 * s, by - 20); ctx.fill();
        ctx.shadowBlur = 16; ctx.shadowColor = "#ff2a2a"; ctx.fillStyle = "#ff3a3a"; ctx.beginPath(); ctx.ellipse(bx - 18 * s, by + 4, 9 * s, 4 * s, 0.3, 0, 7); ctx.ellipse(bx + 18 * s, by + 4, 9 * s, 4 * s, -0.3, 0, 7); ctx.fill(); ctx.restore();
      } else if (th === "lumiere") {
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = s * sortie; const lg = ctx.createLinearGradient(x - 50, 0, x + 50, 0); lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(0.5, "rgba(255,240,180,0.85)"); lg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = lg; ctx.fillRect(x - 50, -H_D, 100, SOL + H_D); ctx.restore();
      } else if (th === "foudre") {
        // ciel d'orage qui s'illumine de la couleur de la foudre
        ctx.save(); const flash = (Math.floor(a / 4) % 3 !== 2 && a > FIN.ouv + 10) || (a > FIN.fige - 4 && a < FIN.fige + 16) ? 1 : 0.35;
        for (let i = 0; i < 12; i++) { const nx = x + (i - 5.5) * 48, ny = y - 175 + hasard(i) * 26 - (i % 2) * 18; ctx.globalAlpha = 0.95 * s * sortie; ctx.fillStyle = "#16121e"; ctx.beginPath(); ctx.ellipse(nx, ny, 62, 30, 0, 0, 7); ctx.fill();
          ctx.globalAlpha = 0.35 * s * sortie * flash; const cg = ctx.createRadialGradient(nx, ny + 10, 4, nx, ny + 10, 60); cg.addColorStop(0, E2.glow); cg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(nx, ny + 6, 60, 28, 0, 0, 7); ctx.fill(); }
        ctx.restore();
      } else if (th === "arcane" || th === "sceaux" || th === "mots") {
        sceau(x, SOL, 90, -a * 0.02, E2.glow, s * sortie, 0.26);
        if (th === "arcane") sceau(x, y, 70 + 30 * s, a * 0.015, E2.c1, 0.6 * s * sortie);
      } else if (th === "ombre") {
        ctx.save(); ctx.globalAlpha = s * sortie; for (let i = 0; i < 6; i++) { const ex = x + (hasard(i) - 0.5) * 300, ey = y - 60 + (hasard(i + 9) - 0.5) * 80; ctx.fillStyle = "#c08aff"; ctx.shadowColor = "#9a5cff"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.ellipse(ex - 7, ey, 5, 2, 0, 0, 7); ctx.ellipse(ex + 7, ey, 5, 2, 0, 0, 7); ctx.fill(); } ctx.restore();
      }
      ctx.restore();
    }
    // devant les combattants
    function finAvant() {
      const fx = etat.finishFx; if (!fx) return;
      const a = ageF(fx), E2 = ELEMENTS[fx.el] || ELEMENTS.physique, v = J[1 - fx.camp], w = J[fx.camp], x = v.x, y = v.y - 84;
      const s = lisse(prog(a, FIN.ouv, FIN.emprise)), tenue = 1 - prog(a, FIN.fige, FIN.fige + 14), th = fx.theme;
      ctx.save();
      if (th === "sceaux") {
        const R = 150 - 92 * s; for (let i = 0; i < 3; i++) { const an = i * 2.094 + a * 0.02, sx = x + Math.cos(an) * R, sy = y + Math.sin(an) * R * 0.6;
          sceau(sx, sy, 20 + 12 * s, a * 0.05 * (i % 2 ? 1 : -1), E2.glow, s * tenue);
          if (s > 0.5) { ctx.save(); ctx.globalAlpha = (s - 0.5) * 2 * tenue; ctx.strokeStyle = "#e8d8ff"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y + 10); ctx.stroke(); ctx.restore(); } }
      } else if (th === "cartes") {
        const n = 24, R = 150 - 80 * s; for (let i = 0; i < n; i++) { const an = i / n * 6.283 + a * 0.06 * (1 + s); const cx = x + Math.cos(an) * R, cy = y + Math.sin(an) * R * 0.35 + Math.sin(i * 1.7 + a * 0.1) * 10;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(an + a * 0.05); ctx.globalAlpha = s * tenue; ctx.fillStyle = "#f4ead0"; ctx.strokeStyle = "#1a1018"; ctx.lineWidth = 1; ctx.fillRect(-6, -9, 12, 18); ctx.strokeRect(-6, -9, 12, 18); ctx.fillStyle = i % 2 ? "#c0102a" : "#1a1018"; ctx.font = "10px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("♠♥♣♦"[i % 4], 0, 0); ctx.restore(); }
      } else if (th === "illusion") {
        [[-120, "pied"], [120, "poing"], [-70, "uppercut"], [70, "special"]].forEach(([dx, pose], k) => { if (s <= 0) return; ctx.save(); ctx.globalAlpha = 0.32 * s * tenue; try { dessinerCombattant({ ...w, x: x + dx * (0.6 + 0.4 * s), y: SOL, face: dx > 0 ? -1 : 1, etat: "finish", poseF: pose, rotF: 0, t: 0 }, a / 60 + k); } catch (_) {} ctx.restore(); });
      } else if (th === "necro") {
        ctx.strokeStyle = "#e8e0c8"; ctx.lineCap = "round"; ctx.shadowColor = "#7fe0a0"; ctx.shadowBlur = 8; ctx.globalAlpha = tenue;
        for (let i = 0; i < 6; i++) { const hx = x + (i - 2.5) * 22, h = 70 * s * (0.7 + 0.3 * hasard(i)), lean = (x - hx) * 0.3 * s, tx = hx + lean, ty = SOL - h;
          ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hx, SOL); ctx.lineTo(tx, ty); ctx.stroke(); ctx.lineWidth = 2;
          for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + k * 5, ty - 12, tx + k * 4 + Math.sign(x - hx) * 6, ty - 18); ctx.stroke(); } }
      } else if (th === "telekinesie" || th === "son") {
        ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = E2.glow; ctx.lineWidth = 2;
        if (th === "son") { const dir = Math.sign(x - w.x) || 1; for (let k = 0; k < 6; k++) { const r = (a * 3 + k * 30) % 180; ctx.globalAlpha = (1 - r / 180) * s * tenue; ctx.beginPath(); ctx.arc(w.x, w.y - 90, r, dir > 0 ? -0.6 : Math.PI - 0.6, dir > 0 ? 0.6 : Math.PI + 0.6); ctx.stroke(); }
          ctx.fillStyle = E2.c1; ctx.font = "18px serif"; for (let i = 0; i < 6; i++) { ctx.globalAlpha = s * tenue * 0.9; ctx.fillText(i % 2 ? "♪" : "♫", x + Math.cos(a * 0.05 + i) * 60, y + Math.sin(a * 0.07 + i * 2) * 50); } }
        else { for (let k = 0; k < 3; k++) { const r = 40 + k * 22 + Math.sin(a * 0.2 + k) * 5; ctx.globalAlpha = 0.7 * s * tenue; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, 7); ctx.stroke(); }
          ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#7a6a8a"; for (let i = 0; i < 8; i++) { const an = a * 0.05 + i * 0.785; ctx.globalAlpha = s * tenue; ctx.fillRect(x + Math.cos(an) * 95 - 5, y + Math.sin(an) * 40 - 5, 10, 8); } }
      } else if (th === "espace") {
        [[-95, -10], [95, -30], [-50, -70], [55, 30]].forEach(([dx, dy], k) => { const ox = x + dx, oy = y + dy, op = s * (0.7 + 0.3 * Math.sin(a * 0.1 + k)); if (op <= 0) return;
          ctx.save(); ctx.globalAlpha = tenue; const pg = ctx.createRadialGradient(ox, oy, 2, ox, oy, 40); pg.addColorStop(0, "#000"); pg.addColorStop(0.7, "#2a0a4a"); pg.addColorStop(1, E2.glow); ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(ox, oy, 14 * op, 40 * op, 0.2 * k, 0, 7); ctx.fill(); ctx.strokeStyle = E2.glow; ctx.lineWidth = 2; ctx.shadowColor = E2.glow; ctx.shadowBlur = 14; ctx.stroke(); ctx.restore(); });
      } else if (th === "mots") {
        const txt = (fx.nom || "ANATHÈME").toUpperCase().replace(/\s+/g, " "), n = txt.length, R = 120 - 50 * s;
        ctx.fillStyle = E2.c1; ctx.shadowColor = E2.glow; ctx.shadowBlur = 12; ctx.font = "700 15px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (let i = 0; i < n; i++) { const an = i / n * 6.283 + a * 0.03; ctx.save(); ctx.globalAlpha = s * tenue; ctx.translate(x + Math.cos(an) * R, y + Math.sin(an) * R * 0.45); ctx.fillText(txt[i], 0, 0); ctx.restore(); }
      } else if (th === "sang") tentacules(x, y, s * tenue, a, 6, "#c0102a", "#3a0008", false);
      else if (th === "ombre") tentacules(x, y, s * tenue, a, 7, "#2a0a4a", "#9a5cff", false);
      else if (th === "nature") tentacules(x, y, s * tenue, a, 6, "#3a7a2a", "#1a3a12", true);
      else if (th === "feu" || th === "lumiere") {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) { const px = x + (i - 2) * 38, h = 170 * s * (0.75 + 0.25 * Math.sin(a * 0.3 + i)) * tenue; if (h < 2) continue; const fg = ctx.createLinearGradient(0, SOL, 0, SOL - h); fg.addColorStop(0, th === "feu" ? "rgba(255,240,140,0.9)" : "rgba(255,255,230,0.9)"); fg.addColorStop(0.5, th === "feu" ? "rgba(255,110,20,0.7)" : "rgba(255,220,120,0.5)"); fg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = fg;
          ctx.beginPath(); ctx.moveTo(px - 16, SOL); ctx.quadraticCurveTo(px - 22 + Math.sin(a * 0.4 + i) * 6, SOL - h * 0.5, px + Math.sin(a * 0.5 + i) * 8, SOL - h); ctx.quadraticCurveTo(px + 22, SOL - h * 0.5, px + 16, SOL); ctx.fill(); }
      } else if (th === "glace" || th === "terre") {
        for (let i = 0; i < 9; i++) { const bx = x + (i - 4) * 20, h = (40 + 90 * hasard(i)) * s * tenue, lean = (x - bx) * 0.5; if (h < 2) continue; ctx.fillStyle = th === "glace" ? "rgba(200,240,255,0.55)" : "#7a5a3a"; ctx.strokeStyle = th === "glace" ? "#ffffff" : "#3a2a1a"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(bx - 10, SOL); ctx.lineTo(bx + lean * 0.4, SOL - h); ctx.lineTo(bx + 10, SOL); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      } else if (th === "foudre") {
        // la foudre tombe du ciel autour de l'adversaire, puis sur lui
        const k = Math.floor(a / 5);
        if (s > 0.15 && a < FIN.emprise && k % 3 !== 2) { const cible = s > 0.7 && k % 2 ? x : x + (hasard(k) - 0.5) * 180; eclairCiel(cible + (hasard(k + 5) - 0.5) * 60, y - 190, cible, cible === x ? y : SOL, k, 3 + 2 * s, E2.glow); }
        if (fx.coupT && a >= FIN.emprise && a < FIN.rafale) { const l = (performance.now() - fx.coupT) / 1000 * 60; if (l < 6) eclairCiel(x + (hasard(fx.coups) - 0.5) * 50, y - 210, x, y, fx.coups * 3, 4, E2.glow); }
        if (a > FIN.fige - 4 && a < FIN.fige + 22) { const l = prog(a, FIN.fige - 4, FIN.fige + 22); eclairCiel(x + 20, y - 420, x, SOL, 99 + Math.floor(a / 3), 10 * (1 - l * 0.6), E2.glow); }
      } else if (th === "poison") {
        for (let i = 0; i < 14; i++) { const by = SOL - ((a * 1.5 + i * 23) % 170), bx = x + Math.sin(i * 3 + a * 0.05) * 50; ctx.globalAlpha = 0.7 * s * tenue; ctx.strokeStyle = E2.c1; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, 4 + hasard(i) * 6, 0, 7); ctx.stroke(); }
        ctx.globalAlpha = 0.35 * s * tenue; ctx.fillStyle = E2.c2; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + (i - 2) * 40, SOL - 20, 50, 22, 0, 0, 7); ctx.fill(); }
      } else if (th === "eau" || th === "vent") {
        ctx.strokeStyle = th === "eau" ? E2.c1 : "rgba(255,255,255,0.8)"; ctx.lineWidth = 2.5; ctx.globalCompositeOperation = "lighter";
        for (let k = 0; k < 8; k++) { const hy = SOL - k * 26 * s, r = (th === "vent" ? 20 + k * 11 : 70 - k * 4) * s; ctx.globalAlpha = 0.75 * s * tenue; ctx.beginPath(); ctx.ellipse(x + Math.sin(a * 0.15 + k) * 8, hy - 10, r, r * 0.28, 0, (a * 0.12 + k) % 6.28, (a * 0.12 + k) % 6.28 + 4.4); ctx.stroke(); }
      } else if (th === "physique" || th === "metamorphose" || th === "gravite" || th === "invocation" || th === "temps") {
        if (s > 0 && a < FIN.fige) { ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5; const k = Math.floor(a / 3); for (let i = 0; i < 36; i++) { const an = hasard(k * 50 + i) * 6.283, r1 = 130 + 40 * hasard(i), r2 = 420; ctx.globalAlpha = 0.6 * s; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); ctx.lineTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2); ctx.stroke(); } }
      }
      ctx.restore();
      // la rafale : un éclair de lame à chaque coup
      if (fx.coupT && a < FIN.rafale + 4) { const l = (performance.now() - fx.coupT) / 1000 * 60; if (l < 9) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.translate(x, y); ctx.rotate(fx.coupA); ctx.strokeStyle = "#fff"; ctx.shadowColor = E2.glow; ctx.shadowBlur = 18; ctx.lineWidth = 7 * (1 - l / 9); ctx.beginPath(); ctx.arc(0, 0, 54, -1.1, 1.1); ctx.stroke(); ctx.strokeStyle = E2.glow; ctx.lineWidth = 3 * (1 - l / 9); ctx.beginPath(); ctx.arc(-8, 0, 60, -1.2, 1.2); ctx.stroke(); ctx.restore(); } }
      // l'instant figé : une grande entaille qui traverse l'écran
      if (a >= FIN.rafale && a < FIN.fige + 6) { const k = lisse(prog(a, FIN.rafale + 2, FIN.rafale + 9)); ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "#fff"; ctx.shadowColor = E2.glow; ctx.shadowBlur = 24; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 320, y + 140); ctx.lineTo(x - 320 + 640 * k, y + 140 - 280 * k); ctx.stroke(); ctx.restore(); }
      // onde de choc finale
      if (a >= FIN.fige && a < FIN.fige + 40) { const k = prog(a, FIN.fige, FIN.fige + 40); ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = E2.glow; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.ellipse(x, SOL, 30 + 300 * k, 8 + 50 * k, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    }
    // par-dessus tout (hors caméra) : bandes noires, nom du coup, compteur, image figée, K.O.
    function finEcran() {
      const fx = etat.finishFx; if (!fx) return;
      const a = ageF(fx), E2 = ELEMENTS[fx.el] || ELEMENTS.physique;
      ctx.save();
      if (fx.theme === "temps" && a > FIN.ouv && a < FIN.rafale) { ctx.globalCompositeOperation = "saturation"; ctx.globalAlpha = 0.9 * lisse(prog(a, FIN.ouv, FIN.ouv + 30)); ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W_D, H_D); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
      if (a >= FIN.rafale + 4 && a < FIN.fige) { ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W_D, H_D); ctx.globalCompositeOperation = "difference"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W_D, H_D); ctx.globalCompositeOperation = "source-over"; }
      if (a >= FIN.fige && a < FIN.fige + 20) { ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.6 * (1 - prog(a, FIN.fige, FIN.fige + 20)); ctx.fillStyle = E2.glow; ctx.fillRect(0, 0, W_D, H_D); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
      const bande = 34 * lisse(Math.min(1, a / 14)) * (1 - lisse(prog(a, FIN.fin - 40, FIN.fin)));
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W_D, bande); ctx.fillRect(0, H_D - bande, W_D, bande);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const al = prog(a, 6, 18) * (1 - prog(a, FIN.emprise - 8, FIN.emprise + 4));
      if (al > 0) {
        const sc = 1 + 0.15 * (1 - lisse(prog(a, 6, 22)));
        const yT = H_D - 92;
        ctx.globalAlpha = al * 0.8; const bg = ctx.createLinearGradient(0, yT - 44, 0, yT + 50); bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(0.35, "rgba(0,0,0,0.85)"); bg.addColorStop(1, "rgba(0,0,0,0.9)"); ctx.fillStyle = bg; ctx.fillRect(0, yT - 44, W_D, 94);
        ctx.globalAlpha = al; ctx.font = "700 11px system-ui"; ctx.fillStyle = E2.glow; ctx.fillText("✦  C O U P   D E   G R Â C E  ✦", W_D / 2, yT - 30);
        ctx.save(); ctx.translate(W_D / 2, yT); ctx.scale(sc, sc); ctx.font = "900 32px Georgia, serif"; ctx.lineWidth = 6; ctx.strokeStyle = "#000"; ctx.strokeText(fx.nom, 0, 0); ctx.shadowColor = E2.glow; ctx.shadowBlur = 22; ctx.fillStyle = "#fff"; ctx.fillText(fx.nom, 0, 0); ctx.restore();
        if (fx.ulti || fx.desc) { ctx.font = "italic 12px Georgia, serif"; ctx.fillStyle = "#e8dcc0"; const d = fx.ulti && fx.ulti !== fx.nom ? (fx.desc ? `${fx.ulti} — ${fx.desc}` : fx.ulti) : fx.desc; ctx.fillText(d.length > 86 ? d.slice(0, 84) + "…" : d, W_D / 2, yT + 28); }
      }
      if (a >= FIN.emprise && bande > 4) { ctx.globalAlpha = 1; ctx.textAlign = "left"; ctx.font = "700 13px Georgia, serif"; ctx.fillStyle = E2.glow; ctx.fillText("✦ " + fx.nom, 14, H_D - bande / 2); }
      if (fx.coups > 0 && a < FIN.fige) { ctx.globalAlpha = 1; ctx.textAlign = "right"; ctx.font = "900 30px Georgia, serif"; ctx.lineWidth = 5; ctx.strokeStyle = "#000"; const tx = `${fx.coups} COUPS`; ctx.strokeText(tx, W_D - 18, 70); ctx.fillStyle = fx.coups >= 5 ? "#ff5a3a" : "#ffd84a"; ctx.fillText(tx, W_D - 18, 70); }
      if (a >= FIN.fige + 6 && a < FIN.fin - 20) { const k = prog(a, FIN.fige + 6, FIN.fige + 18), sc = 1.8 - 0.8 * lisse(k); ctx.globalAlpha = Math.min(1, k * 2) * (1 - prog(a, FIN.fin - 40, FIN.fin - 20)); ctx.textAlign = "center"; ctx.save(); ctx.translate(W_D / 2, H_D / 2 - 10); ctx.scale(sc, sc); ctx.font = "900 64px Georgia, serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#000"; ctx.strokeText("K.O.", 0, 0); ctx.shadowColor = E2.glow; ctx.shadowBlur = 26; ctx.fillStyle = "#ff3a3a"; ctx.fillText("K.O.", 0, 0); ctx.restore(); }
      ctx.restore();
    }
    function finRound(gagnant, sansFinish, avecFinish) {
      if (etat.fini || etat.phase === "entreRounds") return;
      if (gagnant === null) { gagnant = J[0].pv === J[1].pv ? -1 : J[0].pv > J[1].pv ? 0 : 1; }
      if (gagnant >= 0) { etat.victoires[gagnant]++; changerEtat(J[gagnant], "victoire"); if (sansFinish) { changerEtat(J[1 - gagnant], "ko"); } }
      etat.phase = "entreRounds";
      const fin = etat.victoires.some((v) => v >= ROUNDS);
      if (!fin) { evt({ k: "banniere", txt: gagnant < 0 ? "Égalité" : `${J[gagnant].c.nom} gagne le round`, vie: 1.8 }); setTimeout(() => { if (!vivante) return; etat.round++; debutRound(); }, 2200); return; }
      etat.fini = true;
      const g = etat.victoires[0] >= ROUNDS ? 0 : 1;
      evt({ k: "banniere", txt: `${J[g].c.nom} gagne !`, sous: avecFinish ? "par coup de grâce" : "", vie: 3, couleur: "#f5d08a" });
      const res = { g, gagne: g === moiIdx, chrono: Math.ceil(etat.chrono / 60), pv: J[moiIdx].pv / J[moiIdx].pvMax, parfait: J[g].pv >= J[g].pvMax, finish: avecFinish ? etat.finish.nom : "", gagnant: J[g].c, perdant: J[1 - g].c, moi: J[moiIdx].c };
      setTimeout(() => { if (vivante) opts.fin({ ...res, titre: g === moiIdx || opts.mode === "deux" ? `🏆 ${J[g].c.nom} remporte le duel !` : `💀 ${J[g].c.nom} remporte le duel…` }); }, 2600);
    }

    // ---- état réseau (l'hôte envoie, l'invité affiche) ----
    const exporter = () => ({
      j: J.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), face: p.face, etat: p.etat, t: p.t, pv: Math.round(p.pv), super: Math.round(p.super), rc: p.recharge, sr: p.sigRecharge, co: p.comboT > 0 ? p.comboAff : 0, coup: p.coup && p.coup.pose, blanc: p.blanc > 0.5 ? 1 : 0, bloque: p.bloque ? 1 : 0, tb: p.toucheBas ? 1 : 0, pf: p.poseF || 0, rf: p.rotF ? Math.round(p.rotF * 100) / 100 : 0 })),
      v: etat.victoires, a: actifs.slice(), ep: equipes.map((eq) => eq.map((p) => Math.round(p.pv))),
      pr: etat.projectiles.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y), el: q.el, camp: q.camp, forme: q.forme, gros: q.gros, vx: q.vx, vy: q.vy })), ch: etat.chrono, r: etat.round, fi: etat.fini ? 1 : 0, ac: etat.acheve ? 1 : 0,
      evts: evts.splice(0),
    });
    function importer(s) {
      if (s.a) s.a.forEach((a, i) => { if (equipes[i][a] && actifs[i] !== a) { actifs[i] = a; J[i] = equipes[i][a]; } });
      if (s.ep) s.ep.forEach((l, i) => l.forEach((pv, k) => { if (equipes[i][k]) equipes[i][k].pv = pv; }));
      if (s.v) etat.victoires = s.v;
      s.j.forEach((q, i) => { const p = J[i]; p.sigRecharge = q.sr || 0; if (q.co) { p.comboAff = q.co; p.comboT = 30; } p.x += (q.x - p.x) * 0.6; p.y += (q.y - p.y) * 0.6; Object.assign(p, { face: q.face, etat: q.etat, t: q.t, pv: q.pv, super: q.super, recharge: q.rc, bloque: q.bloque, toucheBas: !!q.tb, poseF: q.pf || null, rotF: q.rf || 0 }); if (q.blanc) p.blanc = 1; p.coup = q.coup ? { pose: q.coup } : null; });
      etat.projectiles = s.pr; etat.chrono = s.ch; etat.round = s.r; etat.acheve = s.ac ? {} : null;
      if (s.fi && !etat.fini) { etat.fini = true; const g = etat.victoires[0] >= ROUNDS ? 0 : 1; setTimeout(() => vivante && opts.fin({ g, gagne: g === moiIdx, gagnant: J[g].c, perdant: J[1 - g].c, moi: J[moiIdx].c, titre: g === moiIdx ? `🏆 ${J[g].c.nom} remporte le duel !` : `💀 ${J[g].c.nom} remporte le duel…` }), 2600); }
    }

    // ---- dessin ----
    function apparenceSecours(p) { return { peau: "#e8c8b0", cheveux: "#2a2030", longueur: 1, haut: "#3a2a4a", pantalon: "#1a1420", bottes: "#100a0e", manteau: "#1a1420", manteauLong: true, aura: (ELEMENTS[p.c.element] || ELEMENTS.physique).glow }; }
    function poseDe(p, t) {
      const P = COMBATTANT.POSES;
      if (p.poseF && (p.etat === "finish" || p.etat === "sonne")) { const k = p.poseF; return { nom: { poing: "poing", uppercut: "poing", pied: "pied", aerien: "pied", special: "magie", finish: "finish" }[k] || "touche", art: P[k] || P.touche }; }
      switch (p.etat) {
        case "marche": return { nom: "marche", art: COMBATTANT.marche(p.t * 0.22) };
        case "accroupi": return { nom: "garde", art: p.bloque ? Object.assign({}, P.accroupi, { bdA: -150, bdB: 150 }) : P.accroupi, bas: true };
        case "saut": return { nom: "garde", art: P.saut };
        case "attaque": { const k = p.coup || {}; const ph = Math.min(1, p.t / Math.max(1, k.debut || 4)); const art = COMBATTANT.melanger(P.garde, P[k.pose] || P.poing, ph); return { nom: k.pose === "pied" || k.pose === "balayage" || k.pose === "aerien" ? "pied" : "poing", art, bas: k.pose === "balayage" }; }
        case "magie": case "super": case "signature": return { nom: "magie", art: P.special };
        case "dash": return { nom: "marche", art: COMBATTANT.marche(p.t * 0.6) };
        case "saisie": return { nom: "poing", art: p.t < 6 ? COMBATTANT.melanger(P.garde, P.poing, p.t / 5) : p.tient ? COMBATTANT.melanger(P.poing, P.uppercut || P.special, Math.min(1, (p.t - 5) / 6)) : P.poing };
        case "entree": return { nom: "garde", art: P.saut };
        case "finish": return { nom: "finish", art: P.finish };
        case "touche": case "garde_coup": return { nom: p.etat === "garde_coup" ? "garde" : "touche", art: p.etat === "garde_coup" ? P.bloc : p.toucheBas ? P.touche_bas || P.touche : P.touche };
        case "envol": return { nom: "touche", art: P.envol || P.touche, chute: true };
        case "aterre": case "ko": return { nom: "touche", art: p.etat === "aterre" && p.t > 32 ? COMBATTANT.melanger(P.allonge || P.touche, P.accroupi, (p.t - 32) / 14) : P.allonge || P.touche, chute: true };
        case "sonne": return { nom: "touche", art: Object.assign({}, P.touche, { hy: 10, tronc: -14 + Math.sin(t * 3) * 10, tete: 24, bdA: 20, bgA: 30, jdA: 20, jdB: -40, jgA: -20, jgB: -30 }) };
        case "victoire": return { nom: "finish", art: P.victoire };
        default: return { nom: "garde", art: p.bloque && (p.etat === "garde") ? P.bloc : Object.assign({}, P.garde, { hy: Math.sin(t * 2.4 + p.phase) * 1.3 }) };
      }
    }
    function dessinerCombattant(p, t) {
      const ps = poseDe(p, t);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.beginPath(); ctx.ellipse(p.x, SOL + 2, 34 * Math.max(0.5, 1 - (SOL - p.y) / 300), 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(p.x, p.y);
      if (p.rotF) { ctx.translate(0, -62); ctx.rotate(p.rotF); ctx.translate(0, 62); }
      const fxm = etat.finishFx; if (fxm && fxm.theme === "metamorphose" && p.cote === fxm.camp && !p.fantome) { const k = 1 + 0.3 * lisse(prog(ageF(fxm), FIN.ouv, FIN.emprise)); ctx.scale(k, k); }
      if (ps.chute) {
        if (p.etat === "envol") {
          // projeté : le corps bascule en arrière en tournant autour des hanches, la tête part vers le sol
          const a = Math.min(Math.PI * 0.62, 0.35 + p.t * 0.075) + (p.vy > 4 ? 0.15 : 0);
          ctx.translate(0, -62); ctx.rotate(-p.face * a); ctx.translate(0, 62);
        } else {
          // au sol, sur le dos (la tête au sol, derrière) ; se relève à la fin
          const releve = p.etat === "aterre" ? Math.min(1, Math.max(0, (p.t - 32) / 14)) : 0;
          const k = p.etat === "ko" ? Math.min(1, p.t / 10) : 1 - releve;
          ctx.translate(-p.face * 10 * k, 0); ctx.rotate(-p.face * k * Math.PI / 2);
        }
      }
      if (p.invuln > 0 && p.etat === "garde" && Math.floor(p.invuln / 3) % 2) ctx.globalAlpha = 0.5;
      ctx.scale(p.face, 1);
      const pl = p.c.planche;
      if (pl) {
        const fr = pl[ps.nom] || pl.garde, hh = (ps.bas ? 120 : 172) * (p.c.app.taille || 1), ww = (hh * fr.img.width) / fr.img.height;
        const lean = p.etat === "attaque" ? 0.06 : p.etat === "touche" ? -0.12 : 0;
        ctx.rotate(lean);
        ctx.drawImage(fr.img, -ww / 2, -hh + (p.etat === "garde" ? Math.sin(t * 2.4 + p.phase) * 1.5 : 0), ww, hh);
        if (p.blanc > 0) { ctx.globalAlpha = p.blanc; ctx.drawImage(fr.blanc, -ww / 2, -hh, ww, hh); ctx.globalAlpha = 1; }
      } else {
        ctx.scale(1.12, 1.12);
        COMBATTANT.dessiner(ctx, p.c.app, ps.art, t, p.etat === "victoire" ? "sourire" : null);
      }
      ctx.restore();
      if (!pl && p.blanc > 0) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = p.blanc * 0.5; const g = ctx.createRadialGradient(p.x, p.y - 90, 4, p.x, p.y - 90, 70); g.addColorStop(0, "#fff"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(p.x - 70, p.y - 170, 140, 170); ctx.restore(); }
      p.blanc = Math.max(0, p.blanc - 0.09);
      // garde : bouclier hexagonal
      if (p.bloque && ["garde", "garde_coup", "accroupi"].includes(p.etat) && p.etat !== "marche") { ctx.save(); ctx.globalAlpha = p.etat === "garde_coup" ? 0.8 : 0.25; ctx.strokeStyle = "#9adcff"; ctx.lineWidth = 2; ctx.beginPath(); const cx = p.x + p.face * 30, cy = p.y - (p.etat === "accroupi" ? 50 : 90); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + 0.52; ctx.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 38); } ctx.closePath(); ctx.stroke(); ctx.restore(); }
      if (p.etat === "sonne") for (let i = 0; i < 4; i++) { const a = t * 4 + i * 1.57; ctx.fillStyle = "#fff2a0"; ctx.font = "14px sans-serif"; ctx.fillText("★", p.x + Math.cos(a) * 24 - 6, p.y - 168 + Math.sin(a) * 6); }
      // aura quand l'attaque spéciale ou le super est disponible
      if (etat.phase === "combat" && !["ko", "sonne", "envol"].includes(p.etat)) {
        const E2 = ELEMENTS[p.c.element] || ELEMENTS.physique, h = 150 * (p.c.app.taille || 1);
        if (p.super >= 100) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          // flammes d'énergie qui montent tout autour du corps
          for (let i = 0; i < 9; i++) {
            const k = i / 8, ph = t * 5 + i * 1.3, hx = p.x + (k - 0.5) * 70 + Math.sin(ph) * 5, haut = h * (0.75 + 0.3 * Math.sin(ph * 1.7));
            const g = ctx.createLinearGradient(hx, p.y, hx, p.y - haut); g.addColorStop(0, E2.glow); g.addColorStop(0.6, E2.c2); g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = 0.22; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx - 12, p.y); ctx.quadraticCurveTo(hx - 16 + Math.sin(ph) * 8, p.y - haut * 0.5, hx + Math.sin(ph * 2) * 6, p.y - haut); ctx.quadraticCurveTo(hx + 16 + Math.cos(ph) * 8, p.y - haut * 0.5, hx + 12, p.y); ctx.fill();
          }
          ctx.globalAlpha = 0.5 + Math.sin(t * 8) * 0.2; ctx.strokeStyle = E2.glow; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 44, 9, 0, 0, 7); ctx.stroke();
          ctx.restore();
          if (Math.random() < 0.5) ajouter({ x: p.x + rnd(-34, 34), y: p.y - rnd(0, 30), vy: rnd(-140, -70), vx: rnd(-10, 10), couleur: Math.random() < 0.5 ? E2.c1 : "#ffffff", taille: rnd(1.5, 3), vie: rnd(0.4, 0.8), forme: p.c.element === "sang" ? "goutte" : "rond" });
        } else if (p.recharge <= 0) {
          // spécial prêt : petit halo pulsant dans la main et cercle au sol
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const pul = 0.5 + Math.sin(t * 6) * 0.5;
          ctx.globalAlpha = 0.25 + pul * 0.25; ctx.strokeStyle = E2.glow; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 30 + pul * 4, 6 + pul, 0, 0, 7); ctx.stroke();
          const mx = p.x + p.face * 26, my = p.y - h * 0.55, g = ctx.createRadialGradient(mx, my, 0, mx, my, 14 + pul * 4);
          g.addColorStop(0, "#fff"); g.addColorStop(0.35, E2.c1); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.55 + pul * 0.3; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 18, 0, 7); ctx.fill();
          ctx.restore();
          if (Math.random() < 0.15) ajouter({ x: mx + rnd(-6, 6), y: my + rnd(-6, 6), vy: rnd(-40, -10), couleur: E2.c1, taille: rnd(1.2, 2.4), vie: 0.5 });
        }
      }
      // aura de magie pendant le super
      if (p.etat === "super" || p.etat === "finish") { const E2 = ELEMENTS[p.c.element] || ELEMENTS.physique; ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 + Math.sin(t * 12) * 0.15; const g = ctx.createRadialGradient(p.x, p.y - 80, 10, p.x, p.y - 80, 110); g.addColorStop(0, E2.glow); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(p.x - 120, p.y - 200, 240, 220); ctx.restore(); }
    }
    function fond(t) {
      dessinerArene(ctx, opts.arene || "cathedrale", t, W_D, H_D, SOL);
    }
    function hud(t) {
      J.forEach((p, i) => {
        const x = i ? W_D - 24 - 250 : 24, w = 250;
        p.pvAff += (p.pv - p.pvAff) * 0.08;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x - 2, 14, w + 4, 16);
        const k1 = p.pvAff / p.pvMax, k2 = p.pv / p.pvMax;
        ctx.fillStyle = "#ffef9a"; ctx.fillRect(i ? x + w * (1 - k1) : x, 16, w * k1, 12);
        ctx.fillStyle = k2 < 0.25 ? "#e04040" : "#5fd18a"; ctx.fillRect(i ? x + w * (1 - k2) : x, 16, w * k2, 12);
        ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#f2ecdc"; ctx.textAlign = i ? "right" : "left"; ctx.shadowColor = "#000"; ctx.shadowBlur = 3;
        ctx.fillText(p.c.nom, i ? x + w : x, 44); ctx.shadowBlur = 0;
        for (let r = 0; r < ROUNDS; r++) { ctx.fillStyle = r < etat.victoires[i] ? "#f5d08a" : "rgba(255,255,255,0.15)"; ctx.beginPath(); ctx.arc(i ? x + w - 8 - r * 14 - ctx.measureText(p.c.nom).width - 10 : x + ctx.measureText(p.c.nom).width + 14 + r * 14, 40, 4.5, 0, 7); ctx.fill(); }
        // jauge de super
        const sy = H_D - 18, sw = 160, sx = i ? W_D - 24 - sw : 24;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(sx - 2, sy - 2, sw + 4, 10);
        const E2 = ELEMENTS[p.c.element] || ELEMENTS.physique;
        ctx.fillStyle = p.super >= 100 ? `rgba(255,255,255,${0.7 + Math.sin(t * 10) * 0.3})` : E2.glow; ctx.fillRect(i ? sx + sw * (1 - p.super / 100) : sx, sy, sw * p.super / 100, 6);
        ctx.font = "700 10px system-ui"; ctx.fillStyle = p.super >= 100 ? "#fff" : "#c8c0b0"; ctx.fillText(p.super >= 100 ? "SUPER PRÊT" : "Super", i ? sx + sw : sx, sy - 5);
        const pret = p.recharge <= 0; ctx.fillStyle = pret ? E2.glow : "rgba(255,255,255,0.25)"; ctx.textAlign = i ? "right" : "left"; ctx.fillText(pret ? "✦ Spécial" : `Spécial ${Math.ceil(p.recharge / 60)}s`, i ? sx - 8 : sx + sw + 8, sy + 5);
        const sp = p.sigRecharge <= 0; ctx.fillStyle = sp ? "#ffe58a" : "rgba(255,255,255,0.25)"; ctx.fillText(sp ? "★ Signature" : `Signature ${Math.ceil(p.sigRecharge / 60)}s`, i ? sx - 8 : sx + sw + 8, sy - 8);
        if (p.boss) { ctx.fillStyle = "#ff4a4a"; ctx.font = "800 11px system-ui"; ctx.fillText("BOSS", i ? x + w : x, 58); }
        // duo : le partenaire en attente
        if (duo) { const r = equipes[i].find((q) => q !== p); if (r) { const ry = 50, rw = 110, rx = i ? x + w - rw : x; ctx.globalAlpha = 0.85; ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(rx, ry + 12, rw, 6); ctx.fillStyle = r.pv > 0 ? "#7ab0e0" : "#5a2a2a"; ctx.fillRect(i ? rx + rw * (1 - r.pv / r.pvMax) : rx, ry + 12, rw * Math.max(0, r.pv / r.pvMax), 6); ctx.font = "600 10px system-ui"; ctx.fillStyle = "#c8d8f0"; ctx.fillText(`⇄ ${r.c.nom}${r.pv <= 0 ? " (K.O.)" : p.tagCd > 0 ? "" : " — relais prêt"}`, i ? x + w : x, ry + 30); ctx.globalAlpha = 1; } }
        // compteur de combo
        if (p.comboT > 0 && p.comboAff >= 2) { const a = Math.min(1, p.comboT / 20); ctx.save(); ctx.globalAlpha = a; ctx.textAlign = i ? "right" : "left"; ctx.font = "900 26px Georgia, serif"; ctx.lineWidth = 5; ctx.strokeStyle = "#000"; const tx = i ? W_D - 30 : 30, ty = 110; ctx.strokeText(`${p.comboAff} COUPS`, tx, ty); ctx.fillStyle = p.comboAff >= 5 ? "#ff5a3a" : "#ffd84a"; ctx.fillText(`${p.comboAff} COUPS`, tx, ty); ctx.font = "700 12px system-ui"; ctx.fillStyle = "#fff"; ctx.fillText(`${p.comboDmg || ""} dégâts`, tx, ty + 18); ctx.restore(); }
      });
      if (entrainement) {
        ctx.save(); ctx.fillStyle = "rgba(10,8,25,0.7)"; ctx.fillRect(W_D / 2 - 150, 52, 300, 70); ctx.textAlign = "center"; ctx.fillStyle = "#f5d08a"; ctx.font = "700 12px system-ui";
        ctx.fillText(`ENTRAÎNEMENT — dernier combo : ${J[0].comboAff || 0} coups, ${J[0].comboDmg || 0} dégâts`, W_D / 2, 68);
        ctx.font = "10px system-ui"; ctx.fillStyle = "#e0d8c8";
        ctx.fillText("Combo : Coup → Coup → Fort → Spécial (enchaîne pendant que ça touche)", W_D / 2, 84);
        ctx.fillText(`Signature (${J[0].c.sigNom}) : ↓ ↘ → + Spécial  ·  Ruée : → →`, W_D / 2, 98);
        ctx.fillText("Projection : → + Coup collé  ·  Lanceur : → + Fort  ·  Garde : recule", W_D / 2, 112); ctx.restore();
      }
      ctx.textAlign = "center"; ctx.font = "700 24px Georgia, serif"; ctx.fillStyle = "#f5d08a"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
      ctx.fillText(entrainement ? "∞" : String(Math.max(0, Math.ceil(etat.chrono / 60))), W_D / 2, 32); ctx.shadowBlur = 0;
      if (etat.banniere) {
        const b = etat.banniere; b.age += 1 / 60; const k = b.age / b.vie;
        if (k >= 1) etat.banniere = null;
        else {
          const a = k < 0.12 ? k / 0.12 : k > 0.82 ? (1 - k) / 0.18 : 1, s = 1 + (k < 0.12 ? (0.12 - k) * 3 : 0);
          ctx.save(); ctx.globalAlpha = a; ctx.translate(W_D / 2, 150); ctx.scale(s, s);
          ctx.font = "900 40px Georgia, serif"; ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(b.txt, 0, 0); ctx.fillStyle = b.couleur; ctx.shadowColor = b.couleur; ctx.shadowBlur = 16; ctx.fillText(b.txt, 0, 0); ctx.shadowBlur = 0;
          if (b.sous) { ctx.font = "600 14px system-ui"; ctx.fillStyle = "#e8e0d0"; ctx.fillText(b.sous, 0, 26); }
          ctx.restore();
        }
      }
    }
    function dessinerParts(dt) {
      ctx.save();
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt;
        if (p.age >= p.vie) { parts.splice(i, 1); continue; }
        const k = 1 - p.age / p.vie;
        if (p.anneau) { const r = p.r + (p.rmax - p.r) * (1 - k); ctx.globalAlpha = k; ctx.strokeStyle = p.couleur; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.7, 0, 0, 7); ctx.stroke(); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        ctx.globalAlpha = k; ctx.globalCompositeOperation = p.add ? "lighter" : "source-over"; ctx.fillStyle = p.couleur; ctx.strokeStyle = p.couleur;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); const t = p.taille;
        if (p.forme === "goutte") { ctx.beginPath(); ctx.arc(0, 0, t * 0.7, 0, 7); ctx.fill(); }
        else if (p.forme === "eclat") { ctx.beginPath(); ctx.moveTo(0, -t * 1.4); ctx.lineTo(t * 0.5, 0); ctx.lineTo(0, t * 1.4); ctx.lineTo(-t * 0.5, 0); ctx.fill(); }
        else if (p.forme === "fumee") { ctx.globalAlpha = k * 0.5; ctx.beginPath(); ctx.arc(0, 0, t * (2 - k), 0, 7); ctx.fill(); }
        else if (p.forme === "etoile") { ctx.beginPath(); for (let j = 0; j < 8; j++) { const r = j % 2 ? t * 0.4 : t; ctx.lineTo(Math.cos(j * 0.785) * r, Math.sin(j * 0.785) * r); } ctx.fill(); }
        else if (p.forme === "trait") { ctx.lineWidth = Math.max(1, t * 0.6); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-t * 3, 0); ctx.lineTo(t * 3, 0); ctx.stroke(); }
        else if (p.forme === "roche") ctx.fillRect(-t / 2, -t / 2, t, t);
        else if (p.forme === "carte") { ctx.fillRect(-4, -6, 8, 12); ctx.strokeStyle = "#1a1018"; ctx.lineWidth = 0.8; ctx.strokeRect(-4, -6, 8, 12); }
        else { ctx.beginPath(); ctx.arc(0, 0, t, 0, 7); ctx.fill(); }
        ctx.restore();
      }
      ctx.restore();
      textes.forEach((z) => { z.age += dt; const k = z.age / z.vie; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4); ctx.font = `800 ${z.gros ? 20 : 15}px system-ui`; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.strokeText(z.txt, z.x, z.y - k * 30); ctx.fillStyle = z.couleur; ctx.fillText(z.txt, z.x, z.y - k * 30); ctx.restore(); });
      for (let i = textes.length - 1; i >= 0; i--) if (textes[i].age > textes[i].vie) textes.splice(i, 1);
    }
    function dessinerProjectiles(t) {
      etat.projectiles.forEach((q) => {
        const E2 = ELEMENTS[q.el] || ELEMENTS.physique;
        if (q.forme === "carte") { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t * 14); ctx.fillStyle = "#f4ead0"; ctx.strokeStyle = "#1a1018"; ctx.lineWidth = 1; ctx.fillRect(-6, -9, 12, 18); ctx.strokeRect(-6, -9, 12, 18); ctx.fillStyle = "#c0102a"; ctx.font = "10px serif"; ctx.textAlign = "center"; ctx.fillText(["♠", "♥", "♦", "♣"][Math.floor(q.x / 30) % 4 >= 0 ? Math.floor(Math.abs(q.x) / 30) % 4 : 0], 0, 4); ctx.restore(); if (Math.random() < 0.4) ajouter({ x: q.x, y: q.y, vx: -q.vx * 5, vy: 0, couleur: E2.glow, taille: 2, vie: 0.3 }); return; }
        if (q.forme === "vague") { ctx.save(); ctx.globalCompositeOperation = "lighter"; for (let k = 0; k < 3; k++) { ctx.globalAlpha = 0.5 - k * 0.12; ctx.fillStyle = k ? E2.c2 : E2.c1; ctx.beginPath(); ctx.ellipse(q.x - Math.sign(q.vx) * k * 14, SOL - 18 - k * 4, 34 - k * 6, 26 + Math.sin(t * 20 + k) * 4, 0, Math.PI, 0); ctx.fill(); } ctx.restore(); for (let k = 0; k < 2; k++) ajouter({ x: q.x + rnd(-20, 20), y: SOL - rnd(10, 40), vx: rnd(-30, 30), vy: rnd(-120, -40), g: 400, couleur: E2.c1, forme: "goutte", taille: rnd(2, 4), vie: 0.5 }); return; }
        if (q.forme === "pluie") { ctx.save(); ctx.globalCompositeOperation = "lighter"; const g2 = ctx.createLinearGradient(q.x, q.y - 40, q.x, q.y); g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(1, E2.c1); ctx.strokeStyle = g2; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(q.x, q.y - 40); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 7); ctx.fill(); ctx.restore(); return; }
        if (Math.random() < 0.8) ajouter({ x: q.x + rnd(-6, 6), y: q.y + rnd(-6, 6), vx: -Math.sign(q.vx || (q.camp ? -1 : 1)) * rnd(10, 40), vy: rnd(-20, 20), couleur: Math.random() < 0.5 ? E2.c1 : E2.c2, taille: rnd(2, 5), vie: 0.35, forme: q.el === "sang" ? "goutte" : q.el === "glace" ? "eclat" : q.el === "ombre" ? "fumee" : "rond", add: !["ombre", "glace"].includes(q.el) });
        ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 22); g.addColorStop(0, "#fff"); g.addColorStop(0.35, E2.c1); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 22 + Math.sin(t * 20) * 2, 0, 7); ctx.fill(); ctx.restore();
      });
    }
    function image(now) {
      if (!vivante) return;
      if (!document.body.contains(canvas)) { arreter(); return; }
      let dt = Math.min(0.1, (now - dernier) / 1000); dernier = now;
      if (!invite) {
        acc += dt * 1000 * (etat.ralenti > 0 ? 0.35 : 1);
        while (acc >= 16.67) { if (!etat.pauseTest) pas(); acc -= 16.67; if (etat.ralenti > 0) etat.ralenti--; }
        if (salle && now - envoiEtat > 33) { envoiEtat = now; salle.send({ type: "broadcast", event: "etat", payload: exporter() }); }
      } else if (instantane) { importer(instantane); instantane = null; }
      const t = (now - t0) / 1000;
      ctx.save();
      if (etat.secousse > 0.3) { ctx.translate(rnd(-etat.secousse, etat.secousse), rnd(-etat.secousse, etat.secousse)); etat.secousse *= 0.85; }
      cameraFinish();
      fond(t);
      finArriere();
      [...J].sort((a, b) => (a.etat === "attaque" ? 1 : 0) - (b.etat === "attaque" ? 1 : 0)).forEach((p) => {
        // sécurité : un combattant hors de l'écran ou avec une position invalide est remis en place
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { p.x = p.cote ? 460 : 180; p.y = SOL; p.vx = p.vy = 0; }
        try { dessinerCombattant(p, t); }
        catch (e) {
          // si l'apparence pose problème, on dessine une silhouette simple et on affiche l'erreur
          for (let k = 0; k < 8; k++) ctx.restore();
          ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.shadowBlur = 0; ctx.filter = "none";
          if (!p.erreurDessin) { p.erreurDessin = e.message || String(e); console.error("Duel – dessin de", p.c.nom, e); }
          try { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.face * 1.12, 1.12); COMBATTANT.dessiner(ctx, apparenceSecours(p), poseDe(p, t).art, t); ctx.restore(); } catch (_) {}
        }
      });
      dessinerProjectiles(t);
      dessinerParts(dt);
      finAvant();
      ctx.restore();
      if (!etat.finishFx) hud(t);
      finEcran();
      const errs = J.filter((p) => p.erreurDessin);
      if (errs.length) { ctx.font = "10px system-ui"; ctx.fillStyle = "#ff8a8a"; ctx.textAlign = "left"; errs.forEach((p, i) => ctx.fillText(`⚠ ${p.c.nom} : ${p.erreurDessin}`.slice(0, 90), 8, H_D - 30 - i * 12)); }
      if (etat.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${etat.flash})`; ctx.fillRect(0, 0, W_D, H_D); etat.flash *= 0.85; }
      requestAnimationFrame(image);
    }
    function arreter() { vivante = false; SON.arreterMusique(); if (typeof battement !== "undefined") clearInterval(battement); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); }
    SON.lancerMusique(opts.arene || "cathedrale");
    if (!invite) debutRound();
    requestAnimationFrame(image);
    return { arreter, _etat: etat, _J: J, _cmd: cmd, _pas: pas, _equipes: equipes, basculerSon: () => SON.basculer(opts.arene || "cathedrale") };
  }

  pages.jeux.rpg = () => enTete("⚔️", "Aetheria Tactics", "Collectionne les personnages, monte ton équipe de 5 et affronte des équipes de plus en plus fortes.") + `<div id="rpg-zone"><p class="discret">Chargement du jeu…</p></div>`;
  pages.jeux.rpg.apres = async () => {
    const z = $("#rpg-zone");
    if (!estMembre()) { z.innerHTML = `<p class="note">Connecte-toi avec un compte membre pour jouer : ta collection est enregistrée sur ton compte.</p>`; return; }
    let rp, rar, profil, collection, vue = lireLS("aetheria_rpg_vue", "combat"), equipe = [], combat = null, auto = lireLS("aetheria_rpg_auto", false);
    const persos = () => persosJeu();
    const infoDe = (id) => { const p = rp.find((x) => x.fiche_id === id); const c = collection.find((x) => x.fiche_id === id); return p ? { role: p.role, rarete: rar.get(id) || "commun", etoiles: c ? c.etoiles : 0, comp: p.competences } : null; };

    // 1) Préparer les compétences de jeu manquantes (une seule fois par personnage)
    try { rp = await api.rpgPersos(); }
    catch (e) { z.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message)}</p>`; return; }
    const manquants = persos().filter((f) => !rp.some((p) => p.fiche_id === f.id));
    if (manquants.length) {
      // 1 essai avec l'IA par groupe de 5 ; si elle ne répond pas (surchargée, quota…), le site crée lui-même les compétences
      const LOT = 5, lots = [];
      for (let i = 0; i < manquants.length; i += LOT) lots.push(manquants.slice(i, i + LOT));
      let fait = 0, panneIA = null, prochain = 0;
      const debut = Date.now();
      const afficher = () => {
        const sec = Math.round((Date.now() - debut) / 1000);
        z.innerHTML = `<div class="prepa-rpg"><div class="jv-titre"><span class="engrenage">⚙️</span> Préparation du jeu</div>
          <p>L'IA crée les compétences de jeu de ${manquants.length} personnage${manquants.length > 1 ? "s" : ""}… <b>${fait}/${manquants.length}</b></p>
          <div class="barre-prepa en-cours"><span style="width:${Math.max(4, Math.round((fait / manquants.length) * 100))}%"></span></div>
          <p class="discret petit-texte">⏱️ ${Math.floor(sec / 60) ? Math.floor(sec / 60) + " min " : ""}${sec % 60} s${panneIA ? " — l'IA ne répond pas : le site termine sans elle…" : ""}</p>
          <p class="discret petit-texte">C'est fait une seule fois par personnage, et ça ne compte pas dans ta limite d'IA. Les fiches ne sont pas modifiées.</p></div>`;
      };
      afficher();
      const minuteur = setInterval(afficher, 1000);
      const travailleur = async () => {
        while (prochain < lots.length && !panneIA) {
          const lot = lots[prochain++];
          try { await avecDelai(api.ia("rpg", { fiche_ids: lot.map((f) => f.id), puissances: Object.fromEntries(lot.map((f) => [f.id, puissance(f)])) })); fait += lot.length; afficher(); }
          catch (e) { panneIA = e; }
        }
      };
      await Promise.all([travailleur(), travailleur()]);
      clearInterval(minuteur);
      rp = await api.rpgPersos();
      const restants = persos().filter((f) => !rp.some((p) => p.fiche_id === f.id));
      if (restants.length) {
        try { await api.rpgAjouterLocal(restants.map(competencesLocales)); rp = await api.rpgPersos(); }
        catch (e) { z.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message)}</p>`; return; }
        toast(`L'IA est indisponible : ${restants.length} personnage${restants.length > 1 ? "s ont" : " a"} reçu des compétences créées par le site. L'IA les améliorera quand elle reviendra.`);
      }
    } else if (rp.some((p) => p.source === "local") && Date.now() - lireLS("aetheria_rpg_amelioration", 0) > 30 * 60000) {
      // en arrière-plan : l'IA améliore quelques personnages faits « sans IA » (au plus 1 essai toutes les 30 min)
      ecrireLS("aetheria_rpg_amelioration", Date.now());
      const lot = rp.filter((p) => p.source === "local").slice(0, 5).map((p) => indexParId.get(p.fiche_id)).filter(Boolean);
      if (lot.length) api.ia("rpg", { fiche_ids: lot.map((f) => f.id), puissances: Object.fromEntries(lot.map((f) => [f.id, puissance(f)])) }).catch(() => {});
    }
    // 2) Mettre à jour la puissance (les dés ont pu changer) → la rareté suit
    const changes = {};
    rp.forEach((p) => { const f = indexParId.get(p.fiche_id); if (f && puissance(f) !== p.puissance) changes[p.fiche_id] = puissance(f); });
    if (Object.keys(changes).length) { try { await api.rpgMajPuissance(changes); rp.forEach((p) => { if (changes[p.fiche_id] !== undefined) p.puissance = changes[p.fiche_id]; }); } catch (e) { console.warn(e); } }
    rp = rp.filter((p) => indexParId.has(p.fiche_id));
    // compétences faites « sans IA » : recalculées avec les règles à jour (en attendant que l'IA les remplace)
    rp.forEach((p) => { if (p.source === "local") { const l = competencesLocales(indexParId.get(p.fiche_id)); p.role = l.role; p.competences = l.competences; } });
    rar = raretesDe(rp);
    if (rp.length < 5) { z.innerHTML = `<p class="note">Il faut au moins 5 personnages prêts pour jouer (${rp.length} pour l'instant).</p>`; return; }
    try { profil = await api.rpgDemarrer(); collection = await api.rpgCollection(); }
    catch (e) { z.innerHTML = `<p class="note erreur-note">⚠️ ${esc(e.message)}</p>`; return; }
    equipe = (profil.equipe || []).filter((id) => collection.some((c) => c.fiche_id === id)).slice(0, 5);

    const htmlBarre = () => `<span>🏰 Palier <b>${profil.palier}</b></span><span>🏆 ${profil.victoires}</span><span>🎴 ${collection.length}/${rp.length}</span>`;
    const tirageDispo = () => !profil.dernier_tirage || profil.dernier_tirage < jourBruxelles() ? "gratuit" : profil.tirages_bonus > 0 ? "bonus" : null;
    const dessiner = () => {
      ecrireLS("aetheria_rpg_vue", vue);
      const t = tirageDispo();
      z.innerHTML = `
        <div class="rpg-barre" id="rpg-barre">${htmlBarre()}</div>
        <div class="modes onglets-roue">${[["combat", "⚔️", "Combat"], ["collection", "🎴", "Collection"], ["tirage", "✨", "Tirage" + (t ? " •" : "")]].map(([id, ic, n]) => `<button class="mode ${vue === id ? "actif" : ""}" data-vue="${id}">${ic} ${n}</button>`).join("")}</div>
        <div id="rpg-vue"></div>`;
      $$("[data-vue]", z).forEach((b) => (b.onclick = () => { if (combat && !combat.fini && !confirm("Abandonner le combat en cours ?")) return; if (combat && combat.scene) combat.scene.arreter(); combat = null; vue = b.dataset.vue; dessiner(); }));
      ({ combat: vueCombat, collection: vueCollection, tirage: vueTirage })[vue]();
    };

    /* ----- Collection ----- */
    const vueCollection = () => {
      const v = $("#rpg-vue");
      const tous = rp.map((p) => indexParId.get(p.fiche_id)).sort((a, b) => (RARETES[rar.get(b.id)].ordre - RARETES[rar.get(a.id)].ordre) || a.titre.localeCompare(b.titre, "fr"));
      const compte = (r) => [collection.filter((c) => rar.get(c.fiche_id) === r).length, tous.filter((f) => rar.get(f.id) === r).length];
      v.innerHTML = `<div class="compte-raretes">${Object.entries(RARETES).reverse().map(([k, r]) => { const [a, b] = compte(k); return `<span>${r.ic} ${r.nom} <b>${a}/${b}</b></span>`; }).join("")}</div>
        ${(() => { const n = rp.filter((p) => p.source === "local").length; return n && estAdmin() ? `<div class="note">🛠️ ${n} personnage${n > 1 ? "s ont" : " a"} des compétences faites <b>sans IA</b> (l'IA était indisponible). <button class="btn petit btn-or" id="ameliorer-ia">🤖 Les faire refaire par l'IA</button><div id="ameliorer-zone" class="petit-texte"></div></div>` : ""; })()}
        <p class="discret petit-texte">Touche une carte pour voir ses compétences de jeu. Un doublon tiré donne une ⭐ (5 max), et chaque étoile rend le personnage plus fort.</p>
        <div class="grille-rpg">${tous.map((f) => { const i = infoDe(f.id), a = i.etoiles > 0; return carteRpg(f, i, { cls: a ? "" : "pas-obtenu", data: `data-voir="${esc(f.id)}"` }); }).join("")}</div>
        <div id="rpg-detail"></div>`;
      $$("[data-voir]", v).forEach((c) => (c.onclick = () => montrerDetail(c.dataset.voir)));
      const bi = $("#ameliorer-ia");
      if (bi) bi.onclick = async () => {
        bi.disabled = true;
        const zz = $("#ameliorer-zone"), locaux = rp.filter((p) => p.source === "local").map((p) => indexParId.get(p.fiche_id)).filter(Boolean);
        let fait = 0;
        for (let i = 0; i < locaux.length; i += 5) {
          const lot = locaux.slice(i, i + 5);
          zz.textContent = `⏳ L'IA lit les fiches… ${fait}/${locaux.length}`;
          try { await avecDelai(api.ia("rpg", { fiche_ids: lot.map((f) => f.id), puissances: Object.fromEntries(lot.map((f) => [f.id, puissance(f)])) })); fait += lot.length; }
          catch (e) { zz.innerHTML = `⚠️ Arrêt à ${fait}/${locaux.length} : ${esc(e.message)}<br>Réessaie plus tard, ce qui est fait est gardé.`; bi.disabled = false; return; }
        }
        zz.textContent = `✅ ${fait} personnage${fait > 1 ? "s" : ""} refait${fait > 1 ? "s" : ""} par l'IA. Rechargement…`;
        setTimeout(() => location.reload(), 1200);
      };
    };
    const montrerDetail = (id) => {
      const f = indexParId.get(id), i = infoDe(id), x = forces(f), [ri, rn] = ROLES_RPG[i.role];
      const fond = document.createElement("div");
      fond.className = "feuille-fond resultat-roue";
      fond.innerHTML = `<div class="carte-resultat detail-rpg r-${i.rarete}">
        <div class="cr-titre">${RARETES[i.rarete].ic} ${RARETES[i.rarete].nom} · ${ri} ${rn}</div>
        ${vignette(f, "grande")}
        <div class="cr-nom">${esc(f.titre)}</div>
        ${i.etoiles ? etoilesHtml(i.etoiles) : `<p class="discret">Pas encore dans ta collection.</p>`}
        <p class="petit-texte">⚔️ ${x.attaque} · 🛡️ ${x.defense} · 💚 ${x.soutien} <span class="discret">(bonus de dés)</span></p>
        <ul class="liste-comp">${i.comp.map((c) => `<li><b>${descComp(c)}</b><br><small>${texteComp(c)}</small>${c.description ? `<br><small class="discret">${esc(c.description)}</small>` : ""}</li>`).join("")}</ul>
        <div class="rangee centre"><a class="btn petit" href="#/f/${encodeURIComponent(id)}">Fiche</a><button class="btn btn-or" id="fermer-detail">Fermer</button></div></div>`;
      document.body.appendChild(fond);
      requestAnimationFrame(() => fond.classList.add("ouvert"));
      const fermer = () => { fond.classList.remove("ouvert"); setTimeout(() => fond.remove(), 250); };
      fond.onclick = (e) => { if (e.target === fond) fermer(); };
      $("#fermer-detail", fond).onclick = fermer;
    };

    /* ----- Tirage ----- */
    const vueTirage = () => {
      const v = $("#rpg-vue"), t = tirageDispo();
      v.innerHTML = `<div class="zone-tirage">
        <div class="dos-carte" id="dos-carte">✦</div>
        ${t ? `<button class="btn btn-or large" id="tirer">✨ ${t === "gratuit" ? "Tirage du jour" : `Tirage bonus (${profil.tirages_bonus})`}</button>`
            : `<p>Tu as déjà tiré aujourd'hui. Reviens demain, ou gagne ton premier combat du jour pour un tirage bonus !</p>`}
        <p class="discret petit-texte">Chances : ⚪ Commun 60 % · 🔵 Rare 28 % · 🟣 Épique 10 % · 🟡 Légendaire 2 %</p>
        <div id="resultat-tirage"></div></div>`;
      const b = $("#tirer");
      if (b) b.onclick = async () => {
        b.disabled = true;
        const dos = $("#dos-carte"); dos.classList.add("tourne");
        try {
          const [r] = await Promise.all([api.rpgTirer(), new Promise((ok) => setTimeout(ok, 1400))]);
          if (r.gratuit) profil.dernier_tirage = jourBruxelles(); else profil.tirages_bonus--;
          const c = collection.find((x) => x.fiche_id === r.fiche_id);
          if (c) c.etoiles = r.etoiles; else collection.push({ fiche_id: r.fiche_id, etoiles: r.etoiles });
          const f = indexParId.get(r.fiche_id);
          dessiner();
          $("#dos-carte").remove();
          $("#resultat-tirage").innerHTML = `<div class="revelation r-${r.rarete}">
            ${carteRpg(f, { ...infoDe(r.fiche_id) }, { cls: "grande-carte", badge: r.nouveau ? "NOUVEAU !" : `⭐ ${r.etoiles}/5` })}
            <p class="jv-titre">${RARETES[r.rarete].ic} ${esc(f.titre)}</p>
            <p>${r.nouveau ? `${RARETES[r.rarete].nom} — rejoint ta collection !` : r.etoiles >= 5 && r.etoiles === (c && c.etoiles) ? "Doublon : déjà au maximum (5 étoiles)." : `Doublon : passe à ${r.etoiles} étoile${r.etoiles > 1 ? "s" : ""} !`}</p></div>`;
          $(".revelation .carte-rpg").onclick = () => montrerDetail(r.fiche_id);
        } catch (e) { dos.classList.remove("tourne"); b.disabled = false; toast(e.message, "erreur"); }
      };
    };

    /* ----- Combat ----- */
    const equipeConseillee = () => {
      const mes = collection.map((c) => ({ id: c.fiche_id, i: infoDe(c.fiche_id), p: puissance(indexParId.get(c.fiche_id)) * (1 + 0.08 * (c.etoiles - 1)) })).filter((x) => x.i);
      const pris = new Set(), prendre = (role, n) => mes.filter((x) => x.i.role === role && !pris.has(x.id)).sort((a, b) => b.p - a.p).slice(0, n).map((x) => (pris.add(x.id), x.id));
      const av = prendre("defenseur", 2), at = prendre("attaquant", 2), so = prendre("soutien", 1);
      const reste = mes.filter((x) => !pris.has(x.id)).sort((a, b) => b.p - a.p).map((x) => x.id);
      const l = [...av, ...at, ...so];
      while (l.length < Math.min(5, mes.length)) { const id = reste.shift(); if (av.length < 2 && !l.slice(0, 2).includes(id)) { l.splice(av.length, 0, id); av.push(id); } else l.push(id); }
      return l.slice(0, 5);
    };
    const genererEnnemis = () => {
      const mienne = equipe.map((id) => puissance(indexParId.get(id)) * (1 + 0.08 * ((collection.find((c) => c.fiche_id === id) || {}).etoiles - 1 || 0)));
      const moy = mienne.reduce((a, b) => a + b, 0) / Math.max(1, mienne.length);
      const cible = moy * Math.min(1.8, 0.75 + 0.07 * (profil.palier - 1));
      const autres = rp.filter((p) => !equipe.includes(p.fiche_id));
      const pool = melanger(autres.length >= 5 ? autres : rp).map((p) => ({ p, d: Math.abs(p.puissance - cible) + alea(8) })).sort((a, b) => a.d - b.d).slice(0, 14).map((x) => x.p);
      const pris = [], prendre = (role, n) => pool.filter((p) => p.role === role && !pris.includes(p)).slice(0, n).forEach((p) => pris.push(p));
      prendre("defenseur", 2); prendre("attaquant", 2); prendre("soutien", 1);
      pool.forEach((p) => { if (pris.length < 5 && !pris.includes(p)) pris.push(p); });
      const etoiles = Math.min(5, 1 + Math.floor((profil.palier - 1) / 3)), mult = Math.min(1.5, 0.8 + 0.035 * (profil.palier - 1));
      const ordonne = [...pris.filter((p) => p.role === "defenseur"), ...pris.filter((p) => p.role !== "defenseur")];
      return ordonne.slice(0, 5).map((p, k) => creerUnite(indexParId.get(p.fiche_id), p, etoiles, "eux", k < 2 ? "avant" : "arriere", mult));
    };
    const vueCombat = () => {
      if (combat) return dessinerCombat();
      if (!equipe.length) equipe = equipeConseillee();
      const v = $("#rpg-vue");
      const mes = collection.map((c) => c.fiche_id).filter((id) => infoDe(id)).sort((a, b) => RARETES[rar.get(b)].ordre - RARETES[rar.get(a)].ordre || indexParId.get(a).titre.localeCompare(indexParId.get(b).titre, "fr"));
      const slot = (k) => { const id = equipe[k]; return id ? carteRpg(indexParId.get(id), infoDe(id), { data: `data-retirer="${k}"`, cls: "petite" }) : `<div class="slot-vide">${k < 2 ? "🛡️ Avant" : "Arrière"}</div>`; };
      v.innerHTML = `
        <div class="formation">
          <div class="f-ligne"><span class="f-nom">Première ligne</span>${[0, 1].map(slot).join("")}</div>
          <div class="f-ligne"><span class="f-nom">Arrière</span>${[2, 3, 4].map(slot).join("")}</div>
        </div>
        <p class="discret petit-texte">Les ennemis frappent d'abord la première ligne : mets-y tes défenseurs. Touche une carte de l'équipe pour la retirer, puis une carte de ta collection pour la placer.</p>
        <div class="rangee"><button class="btn petit" id="conseil">✨ Équipe conseillée</button><button class="btn btn-or large" id="go" ${equipe.length ? "" : "disabled"}>⚔️ Combattre (palier ${profil.palier})</button></div>
        <h3 class="titre-tour">Ta collection</h3>
        <div class="grille-rpg">${mes.map((id) => carteRpg(indexParId.get(id), infoDe(id), { cls: "petite " + (equipe.includes(id) ? "dans-equipe" : ""), data: `data-ajouter="${esc(id)}"` })).join("")}</div>`;
      $$("[data-retirer]", v).forEach((c) => (c.onclick = () => { equipe.splice(+c.dataset.retirer, 1); vueCombat(); }));
      $$("[data-ajouter]", v).forEach((c) => (c.onclick = () => {
        const id = c.dataset.ajouter;
        if (equipe.includes(id)) equipe = equipe.filter((x) => x !== id);
        else if (equipe.length < 5) equipe.push(id);
        else return toast("L'équipe est complète : retire d'abord quelqu'un.", "erreur");
        vueCombat();
      }));
      $("#conseil").onclick = () => { equipe = equipeConseillee(); vueCombat(); };
      $("#go").onclick = () => {
        api.rpgSauverEquipe(equipe).catch(() => {});
        const moi = equipe.map((id, k) => { const c = collection.find((x) => x.fiche_id === id); return creerUnite(indexParId.get(id), rp.find((p) => p.fiche_id === id), c ? c.etoiles : 1, "moi", k < 2 ? "avant" : "arriere"); });
        combat = { moi, eux: genererEnnemis(), tour: 0, fatigue: 1, file: [], log: [], fini: false, attente: null };
        nouveauTour();
        dessinerCombat();
        avancer();
      };
    };
    const nouveauTour = () => {
      combat.tour++;
      combat.file = vivants([...combat.moi, ...combat.eux]).map((u) => ({ u, ini: d15() + u.sou * 0.05 + u.att * 0.05 })).sort((a, b) => b.ini - a.ini).map((x) => x.u);
      // à partir du tour 8, la fatigue s'installe : les coups font plus mal, les soins sont plus faibles (évite les combats sans fin)
      combat.fatigue = combat.tour >= 8 ? 1 + 0.2 * (combat.tour - 7) : 1;
      combat.log.unshift(`<div class="log-tour">— Tour ${combat.tour}${combat.fatigue > 1 ? ` · 🥵 fatigue ×${combat.fatigue.toFixed(1)}` : ""} —</div>`);
    };
    const finSiBesoin = async () => {
      if (combat.fini) return true;
      const g = !vivants(combat.eux).length, p = !vivants(combat.moi).length;
      if (!g && !p) return false;
      combat.fini = true; combat.gagne = g; combat.attente = null;
      try { const r = await api.rpgFinCombat(g); combat.bonus = r && r.bonus; } catch (e) { console.warn(e); }
      if (g) { profil.victoires++; profil.palier = Math.min(99, profil.palier + 1); profil.derniere_victoire = jourBruxelles(); if (combat.bonus) profil.tirages_bonus++; } else profil.defaites++;
      const br = $("#rpg-barre"); if (br) br.innerHTML = htmlBarre();
      const bt = $('[data-vue="tirage"]'); if (bt) bt.textContent = "✨ Tirage" + (tirageDispo() ? " •" : "");
      majUI();
      return true;
    };
    let enBoucle = false;
    const avancer = async () => {
      if (enBoucle) return;
      enBoucle = true;
      try {
        while (combat && !combat.fini) {
          if (await finSiBesoin()) return;
          if (!combat.file.length) { nouveauTour(); majUI(); }
          const u = combat.file[0];
          if (u.pv <= 0) { combat.file.shift(); continue; }
          u.comp.forEach((c) => { if (c.attente > 0) c.attente--; });
          if (u.etourdi > 0) {
            u.etourdi = 0; combat.log.unshift(`💫 <b class="camp-${u.camp}">${esc(u.nom)}</b> est étourdi et passe son tour.`);
            combat.file.shift(); finTourUnite(u); majUI();
            if (combat.scene) await combat.scene.etourdi(u);
            continue;
          }
          if (u.camp === "moi" && !auto) { combat.attente = { u, comp: null }; majUI(); return; }
          const { c, cible } = choixIA(combat, u);
          await jouerAction(u, c, cible);
          await new Promise((ok) => setTimeout(ok, auto ? 120 : 260));
        }
      } finally { enBoucle = false; }
    };
    const finTourUnite = (u) => { if (u.provoc > 0) u.provoc--; if (u.renfort > 0) u.renfort--; if (u.faible > 0) u.faible--; };
    const jouerAction = async (u, c, cible) => {
      combat.attente = null; combat.anime = true;
      if (combat.scene) combat.scene.setCiblables([]);
      majUI();
      const cibles = c.cible.startsWith("tous") ? ciblesValides(combat, u, c) : [cible || u];
      const cb = combat;
      const l = appliquer(combat, u, c, cible);
      if (combat.scene) await combat.scene.jouer(u, c, cibles, l.evts || []);
      if (combat !== cb) return;
      combat.log.unshift(`<div class="log-action">${l.join("<br>")}</div>`);
      combat.log = combat.log.slice(0, 40);
      combat.file.shift(); finTourUnite(u);
      combat.anime = false;
      majUI();
    };
    const dessinerCombat = () => {
      const v = $("#rpg-vue");
      if (!v || !combat) return;
      if (!combat.scene || !document.body.contains($("#scene-combat"))) {
        if (combat.scene) combat.scene.arreter();
        v.innerHTML = `<div class="scene-cadre"><canvas id="scene-combat" aria-label="Champ de bataille"></canvas>
          <div class="scene-hud"><span class="hud-eux">⚔️ Palier ${profil.palier}</span><span id="hud-tour">Tour ${combat.tour}</span></div></div>
          <div id="combat-ui"></div>`;
        combat.scene = creerScene($("#scene-combat"), combat, (u) => {
          const a = combat.attente;
          if (!a || !a.comp || combat.anime) return;
          if (!ciblesValides(combat, a.u, a.comp).includes(u)) return toast("Cette cible n'est pas valable pour cette compétence.", "erreur");
          jouerAction(a.u, a.comp, u).then(avancer);
        });
      }
      majUI();
    };
    const majUI = () => {
      const zui = $("#combat-ui");
      if (!zui || !combat) return;
      const ht = $("#hud-tour"); if (ht) ht.textContent = `Tour ${combat.tour}${combat.fatigue > 1 ? " · 🥵 fatigue" : ""}`;
      combat.vitesse = auto ? 1.6 : 1;
      const a = combat.attente;
      const besoinCible = a && a.comp && !["soi", "tous_ennemis", "tous_allies"].includes(a.comp.cible);
      if (combat.scene) combat.scene.setCiblables(besoinCible ? ciblesValides(combat, a.u, a.comp) : []);
      zui.innerHTML = `
        ${combat.fini ? `<div class="${combat.gagne ? "jeu-victoire" : "jeu-defaite"}"><div class="jv-titre">${combat.gagne ? "🏆 Victoire !" : "💀 Défaite…"}</div>
            <p>${combat.gagne ? `Tu passes au palier ${profil.palier}.${combat.bonus ? " 🎁 Première victoire du jour : <b>un tirage bonus</b> t'attend dans ✨ Tirage !" : ""}` : "Change ton équipe ou réessaie : chaque combat est différent."}</p>
            <div class="rangee centre"><button class="btn btn-or" id="rejouer">⚔️ ${combat.gagne ? "Combat suivant" : "Réessayer"}</button><button class="btn" id="vers-equipe">👥 Modifier l'équipe</button></div></div>`
        : a ? `<div class="panneau-action">
            <div class="pa-titre">À <b>${esc(a.u.nom)}</b> de jouer${besoinCible ? ` · <b>${esc(a.comp.nom)}</b> : touche une cible qui clignote en bleu sur le terrain` : ""}</div>
            <div class="competences">${a.u.comp.map((c, k) => `<button class="btn comp ${a.comp === c ? "btn-or" : ""}" data-comp="${k}" ${c.attente > 0 ? "disabled" : ""}>${descComp(c)}${c.attente > 0 ? ` <small>(${c.attente})</small>` : ""}<small class="comp-detail">${texteComp(c)}</small></button>`).join("")}</div>
          </div>` : `<div class="panneau-action attente-ia">${combat.anime ? "⚔️ Action en cours…" : "…"}</div>`}
        <div class="rangee"><label class="case-auto"><input type="checkbox" id="auto" ${auto ? "checked" : ""}> ⏩ Auto (plus rapide)</label>${!combat.fini ? `<button class="btn petit btn-danger" id="fuir">🏳️ Abandonner</button>` : ""}</div>
        <details class="journal-details"><summary>📜 Journal du combat</summary><div class="journal-combat">${combat.log.join("")}</div></details>`;
      $("#auto").onchange = (e) => { auto = e.target.checked; ecrireLS("aetheria_rpg_auto", auto); combat.vitesse = auto ? 1.6 : 1; if (auto && combat.attente) { combat.attente = null; avancer(); } else majUI(); };
      const fu = $("#fuir"); if (fu) fu.onclick = async () => { if (!confirm("Abandonner ce combat ? Il compte comme une défaite.")) return; combat.moi.forEach((u) => (u.pv = 0)); combat.attente = null; if (combat.scene) combat.scene.sync(); await finSiBesoin(); };
      if (combat.fini) {
        $("#rejouer").onclick = () => { if (combat.scene) combat.scene.arreter(); combat = null; vueCombatDirect(); };
        $("#vers-equipe").onclick = () => { if (combat.scene) combat.scene.arreter(); combat = null; vueCombat(); };
        return;
      }
      $$("[data-comp]", zui).forEach((b) => (b.onclick = () => {
        if (combat.anime || !combat.attente) return;
        const c = a.u.comp[+b.dataset.comp];
        if (["soi", "tous_ennemis", "tous_allies"].includes(c.cible)) jouerAction(a.u, c, c.cible === "soi" ? a.u : null).then(avancer);
        else { a.comp = c; majUI(); }
      }));
    };
    const vueCombatDirect = () => { vueCombat(); const g = $("#go"); if (g && !g.disabled) g.click(); };
    dessiner();
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
      inscription: [pages.inscription], compte: [pages.compte], admin: [pages.admin], roue: [pages.roue], jeux: [pages.jeux], des: [pages.des], ia: [pages.ia], "creer-ia": [pages.creerIA],
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

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
      route.startsWith("/ia") ? "wiki" :
      /^\/(joueurs|joueur)/.test(route) ? "joueurs" :
      route.startsWith("/roue") ? "roue" : "moi";
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
        ${estRace(f) || estPerso(f) ? (() => {
          if (estRace(f)) {
            const d = deRace(desRaces, cleRace(f.titre));
            return `<section class="boite-de">
              <div class="bd-titre">🎲 Dé de la race</div>
              <div class="bd-valeurs">${TYPES_DES.map((t) => `<span>${infoType(t).icone} ${infoType(t).nom} : <b>1d${DE} ${signe(d[CLE_RACE[t]] | 0)}</b></span>`).join("")}</div>
              ${d.nouveau ? `<div class="discret petit-texte">Pas encore réglé : bonus à 0 pour l'instant (à régler dans l'onglet 🎲 Dés).</div>` : ""}
              <a class="btn petit" href="#/des?perso=${encodeURIComponent(f.id)}">🎲 Lancer</a>
            </section>`;
          }
          const race = raceDuPerso(f), dr = race ? deRace(desRaces, race.cle) : null, an = bonusFiche(f, des);
          const ficheRace = race && [...indexParId.values()].find((x) => estRace(x) && cleRace(x.titre) === race.cle);
          return `<section class="boite-de">
            <div class="bd-titre">🎲 Dés du personnage</div>
            <div class="bd-lignes">${TYPES_DES.map((t) => { const br = dr ? dr[CLE_RACE[t]] | 0 : 0, bf = an[t].bonus; return `
              <div class="bd-ligne"><span>${infoType(t).icone} ${infoType(t).nom}</span><b>1d${DE} ${signe(br + bf)}</b>
              <small class="discret">${race ? `race ${signe(br)}` : "race ?"} · fiche ${signe(bf)}${an[t].manuel ? " (réglé à la main)" : an[t].mots.length ? ` (${an[t].mots.slice(0, 4).map(esc).join(", ")})` : ""}</small></div>`; }).join("")}</div>
            <div class="discret petit-texte">${race ? `Race : ${ficheRace ? `<a href="#/f/${encodeURIComponent(ficheRace.id)}">${esc(race.nom)}</a>` : esc(race.nom)}${dr.nouveau ? " (dé pas encore réglé)" : ""}` : "Aucune race : remplis la case « Race / Peuple » de la fiche."} · ${TYPES_DES.some((t) => an[t].manuel) ? "Bonus de fiche réglé à la main par le joueur ou un admin." : `Le bonus de fiche est calculé à partir des mots de la fiche (max +${CFG_DES.BONUS_MAX}).`}</div>
            <a class="btn petit" href="#/des?perso=${encodeURIComponent(f.id)}">🎲 Lancer</a>
          </section>`;
        })() : ""}

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
    pages.editeur.des = id ? deDe(await api.listerDes(), id) : null;
    pages.editeur.desRaces = await api.listerDesRaces();
    const cats = CATS.filter((c) => peutPublier(c.id) || c.id === f.categorie);
    return `
      <div class="entete-page"><div><div class="fil"><a href="#/">Accueil</a> › ${id ? "Modifier" : "Nouvelle fiche"}</div><h1>${id ? "Modifier la fiche" : "Nouvelle fiche"}</h1></div></div>
      <form class="editeur" id="editeur" autocomplete="off">
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

        <fieldset id="champ-de" ${estRace(f) ? "" : "hidden"}><legend>🎲 Dé de la race</legend>
          <p class="discret">Chaque membre de cette race lance 1d${DE} + ces bonus.</p>
          <div class="proposition" id="proposition-race"></div>
          <div class="de-ligne">
            ${TYPES_DES.map((t) => `<label>${infoType(t).icone} ${infoType(t).nom}<input name="de_${t}" type="number" inputmode="numeric" value="0"></label>`).join("")}
          </div>
        </fieldset>
        <fieldset id="champ-analyse" ${estPerso(f) ? "" : "hidden"}><legend>🎲 Bonus de fiche (automatique)</legend>
          <p class="discret">Calculé à partir des mots de la fiche (titre, résumé, infos, texte), jusqu'à +${CFG_DES.BONUS_MAX}. Il s'ajoute au bonus de la race.</p>
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
      $("#champ-de").hidden = c.id !== "peuples";
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
    const c = " " + cle.replace(/[-_'’]/g, " ").replace(/\s+/g, " ").trim() + " ";
    let best = null;
    for (const [nom, v] of Object.entries(table)) {
      const n = normal(nom).replace(/[-_'’]/g, " ").trim();
      const trouve = c.includes(" " + n + " ") || c.includes(" " + n + "s ") || c.includes(" " + n + "x ");
      if (trouve && (!best || n.length > best.n.length)) best = { n, v };
    }
    if (best) return { attaque: best.v[0], defense: best.v[1], soutien: best.v[2], source: "liste" };
    if (ficheRace && (ficheRace.contenu || ficheRace.resume)) {
      const an = analyserFiche(ficheRace);
      if (TYPES_DES.some((t) => an[t].bonus)) return { attaque: an.attaque.bonus, defense: an.defense.bonus, soutien: an.soutien.bonus, source: "fiche" };
    }
    return null;
  }
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
      res[t] = { bonus: Math.min(CFG_DES.BONUS_MAX, Math.round((points * CFG_DES.BONUS_MAX) / CFG_DES.POINTS_POUR_MAX)), mots: [...new Set(trouves)] };
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
    if (c.bonus_perso) p.push(`${signe(c.bonus_perso)} fiche`);
    if (c.bonus_extra) p.push(`${signe(c.bonus_extra)} bonus`);
    return p.join(" ");
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
        <label>Race<select class="c-race">${optRaces}</select></label>
        <div class="c-formule"></div>
      </div>`;
    return `
      <div class="entete-page"><div><h1><span class="ic-titre">🎲</span>Dés</h1>
        <p class="discret">Chaque lancer : <b>1d${DE}</b> + bonus de la <b>race</b> + bonus de la <b>fiche</b> du personnage (analysée automatiquement, jusqu'à +${CFG_DES.BONUS_MAX}).</p></div></div>

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

      <h2 class="titre-section">Dés des races</h2>
      <p class="discret">Chaque race écrite dans la case « Race / Peuple » d'un personnage a son dé : <b>1d${DE} + bonus</b>. Une nouvelle race apparaît ici automatiquement.${estMembre() ? " Modifie les bonus puis appuie sur 💾." : ""}</p>
      ${estMembre() && aRegler.length ? `<button class="btn btn-or" id="appliquer-propositions">💡 Utiliser les dés proposés pour les ${aRegler.length} race${aRegler.length > 1 ? "s" : ""} à régler</button>` : ""}
      ${races.length ? `<div class="table-wrap"><table class="table table-des">
        <thead><tr><th>Race</th>${TYPES_DES.map((t) => `<th>${infoType(t).icone} ${infoType(t).nom}</th>`).join("")}${estMembre() ? "<th></th>" : ""}</tr></thead>
        <tbody>${races.map((r) => { const d = deRace(desRaces, r.cle); return `<tr>
          <td>${r.fiche ? `<a href="#/f/${encodeURIComponent(r.fiche.id)}">${esc(r.nom)}</a>` : esc(r.nom)}${d.nouveau ? ' <span class="badge-nouveau">à régler</span>' : ""}<br><small class="discret">${r.persos.length} perso${r.persos.length > 1 ? "s" : ""}</small>
            ${(() => { const p = proposerRace(r.cle, r.fiche && pages.des.etat.fichesRaces.get(r.fiche.id)); return p && estMembre() && (d.nouveau || TYPES_DES.some((t) => (d[CLE_RACE[t]] | 0) !== p[t])) ? `<div class="proposition">💡 ${p.source === "fiche" ? "D'après sa fiche" : "Proposé"} : ${htmlProposition(p)} <button class="lien" data-proposer="${esc(r.cle)}">utiliser</button></div>` : ""; })()}</td>
          ${TYPES_DES.map((t) => estMembre()
            ? `<td><input type="number" inputmode="numeric" class="r-${t}" data-race="${esc(r.cle)}" value="${d[CLE_RACE[t]] | 0}"></td>`
            : `<td>${signe(d[CLE_RACE[t]] | 0)}</td>`).join("")}
          ${estMembre() ? `<td><button class="btn petit" data-sauver-race="${esc(r.cle)}">💾</button></td>` : ""}</tr>`; }).join("")}</tbody>
      </table></div>` : vide("Aucune race pour l'instant. Remplis la case « Race / Peuple » d'un personnage : son dé apparaîtra ici.")}`;
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
      const perso = indexParId.get($(".c-perso", el).value), race = etat.races.get($(".c-race", el).value);
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
      if (c.bonus_perso) p.push(`${signe(c.bonus_perso)} <span class="discret">(fiche)</span>`);
      const min = 1 + c.bonus_race + c.bonus_perso;
      return `<b>${p.join(" ")}</b><br><span class="discret petit-texte">résultat entre ${min} et ${min + DE - 1}</span>` +
        (c.fiche_id ? `<div class="c-mots">${c._manuel ? "Bonus de fiche réglé à la main." : c._mots.length ? `Fiche analysée : ${c._mots.slice(0, 6).map(esc).join(", ")}` : "Aucun mot-clé trouvé dans la fiche pour ce type de lancer."}</div>` : "");
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

    if (!$("#bouton-lancer")) return;
    const choisirPerso = async (el, id) => {
      const r = raceDuPerso(indexParId.get(id));
      $(".c-race", el).value = r && etat.races.has(r.cle) ? r.cle : "";
      if (id && !etat.completes.has(id)) {
        $(".c-formule", el).innerHTML = `<span class="discret">Analyse de la fiche…</span>`;
        try { etat.completes.set(id, await api.lireFiche(id)); } catch (e) {}
      }
      majFormules();
    };
    $$(".cote").forEach((el) => {
      $(".c-perso", el).onchange = () => choisirPerso(el, $(".c-perso", el).value);
      $(".c-race", el).onchange = majFormules;
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
      else if (estRace(f)) { for (const el of [$("#cote-a"), $("#cote-s")]) $(".c-race", el).value = cleRace(f.titre); majFormules(); }
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
        zone.innerHTML = `<ol class="lancers resultat-frais">${htmlLancer(l, await auteursMap())}</ol>`;
        rafraichir();
      } catch (e) { zone.innerHTML = ""; toast(e.message, "erreur"); }
      b.disabled = false;
    };
  };

  /* ---------- Assistant IA ---------- */
  const NOTE_IA = "L'IA propose, elle ne modifie rien. Elle peut se tromper : vérifie toujours.";
  const htmlAnalyseIA = (a, auteurs) => `
    <div class="ia-meta">${dateFr(a.cree_le)}${auteurs && auteurs.get(a.auteur_id) ? " · demandé par " + esc(auteurs.get(a.auteur_id).pseudo) : ""}</div>
    <div class="contenu ia-texte">${markdown(a.contenu)}</div>`;

  async function brancherAnalyseFiche(id) {
    const zone = $("#ia-contenu");
    if (!zone) return;
    const [a, auteurs] = await Promise.all([api.derniereAnalyse(id), auteursMap()]);
    await majIndexTitres();
    const dessiner = (analyse, msg) => {
      zone.innerHTML = `
        ${analyse ? htmlAnalyseIA(analyse, auteurs) : `<p class="discret">${msg || "Pas encore d'analyse pour cette fiche."}</p>`}
        ${estMembre() ? `<button class="btn petit ${analyse ? "" : "btn-or"}" id="lancer-ia">🤖 ${analyse ? "Relancer l'analyse" : "Analyser cette fiche"}</button>` : ""}
        <p class="discret petit-texte">${NOTE_IA}</p>`;
      const b = $("#lancer-ia");
      if (b) b.onclick = async () => {
        b.disabled = true; b.textContent = "🤖 L'archiviste lit le wiki…";
        try {
          const r = await api.ia("fiche", { fiche_id: id });
          dessiner(r.analyse || { contenu: r.texte, cree_le: new Date().toISOString(), auteur_id: moi().user.id });
          if (typeof r.restant === "number") toast(`Analyse terminée. Il te reste ${r.restant} utilisation${r.restant > 1 ? "s" : ""} aujourd'hui.`);
        } catch (e) { toast(e.message, "erreur"); b.disabled = false; b.textContent = "🤖 Réessayer"; }
      };
    };
    dessiner(a);
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
      chat.insertAdjacentHTML("beforeend", bulle({ role: "user", content: q }) + `<div class="bulle bulle-ia attente" id="attente">🤖 L'archiviste réfléchit…</div>`);
      defiler();
      try {
        const r = await api.ia("question", { question: q, historique: conversationIA.slice(0, -1).slice(-8) });
        conversationIA.push({ role: "assistant", content: r.texte });
        $("#attente").outerHTML = bulle({ role: "assistant", content: r.texte });
      } catch (e) {
        conversationIA.pop();
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
      g.disabled = true; g.textContent = "🔎 L'archiviste lit tout le wiki… (ça peut prendre une minute)";
      try {
        const r = await api.ia("global");
        $("#ia-globale").innerHTML = htmlAnalyseIA(r.analyse || { contenu: r.texte, cree_le: new Date().toISOString() }, pages.ia.auteurs);
        g.textContent = "🔎 Relancer l'analyse du wiki";
      } catch (e) { toast(e.message, "erreur"); g.textContent = "🔎 Réessayer"; }
      g.disabled = false;
    };
  };

  /* ---------- Roue de la chance ---------- */
  const COULEURS_ROUE = ["#e3b866", "#3b4a8c", "#7fc8f8", "#6a4c93", "#c9706b", "#2f6f6a", "#f5d08a", "#4b3b78", "#8fb8de", "#9c5a7a"];
  const lireRoue = () => { try { return JSON.parse(localStorage.getItem("aetheria_roue") || "[]"); } catch (e) { return []; } };
  const ecrireRoue = (l) => { try { localStorage.setItem("aetheria_roue", JSON.stringify(l)); } catch (e) {} };

  pages.roue = async () => {
    await majIndexTitres();
    return `
      <div class="entete-page"><div><h1><span class="ic-titre">🎡</span>Roue de la chance</h1>
        <p class="discret">Touche les personnages pour les mettre dans la roue, puis lance-la.</p></div></div>
      <section class="panneau roue-choix">
        <div class="rangee roue-outils">
          <input id="roue-filtre" type="search" placeholder="Chercher un personnage…">
          <button class="btn petit" id="roue-tous">Tout ajouter</button>
          <button class="btn petit btn-danger" id="roue-vider">Vider</button>
        </div>
        <div class="roue-noms" id="roue-noms"></div>
        <form class="rangee roue-ajout" id="roue-ajout">
          <input name="nom" maxlength="40" placeholder="Ajouter un autre nom (PNJ, joueur…)">
          <button class="btn petit">Ajouter</button>
        </form>
      </section>
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
    let roue = lireRoue().filter((e) => !e.id || indexParId.has(e.id)).map((e) => (e.id ? { id: e.id, nom: indexParId.get(e.id).titre } : e));
    let rotation = 0, enCours = false;
    const canvas = $("#roue"), ctx = canvas.getContext("2d");
    const dansRoue = (id) => roue.some((e) => e.id === id);

    const dessinerNoms = () => {
      const q = normal($("#roue-filtre").value);
      const visibles = persos.filter((f) => !q || normal(f.titre).includes(q));
      const libres = roue.filter((e) => !e.id);
      $("#roue-noms").innerHTML =
        (visibles.map((f) => `<button type="button" class="nom-roue ${dansRoue(f.id) ? "actif" : ""}" data-id="${esc(f.id)}">${dansRoue(f.id) ? "✓ " : ""}${esc(f.titre)}</button>`).join("") +
        libres.map((e, i) => `<button type="button" class="nom-roue actif libre" data-libre="${esc(e.nom)}">✓ ${esc(e.nom)} <span aria-hidden="true">✕</span></button>`).join("")) ||
        `<p class="discret">${persos.length ? "Aucun personnage trouvé." : "Aucune fiche de personnage pour l'instant. Tu peux ajouter des noms à la main ci-dessous."}</p>`;
      $$("[data-id]", $("#roue-noms")).forEach((b) => (b.onclick = () => {
        if (enCours) return;
        const id = b.dataset.id;
        roue = dansRoue(id) ? roue.filter((e) => e.id !== id) : [...roue, { id, nom: indexParId.get(id).titre }];
        majTout();
      }));
      $$("[data-libre]", $("#roue-noms")).forEach((b) => (b.onclick = () => {
        if (enCours) return;
        roue = roue.filter((e) => e.id || e.nom !== b.dataset.libre);
        majTout();
      }));
    };

    const dessinerRoue = () => {
      const W = canvas.width, R = W / 2 - 10, cx = W / 2, cy = W / 2;
      ctx.clearRect(0, 0, W, W);
      ctx.save(); ctx.translate(cx, cy);
      ctx.beginPath(); ctx.arc(0, 0, R + 6, 0, Math.PI * 2); ctx.fillStyle = "#e3b866"; ctx.fill();
      if (!roue.length) {
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = "#151a36"; ctx.fill();
        ctx.restore(); return;
      }
      const n = roue.length, a = (Math.PI * 2) / n;
      roue.forEach((e, i) => {
        const debut = -Math.PI / 2 + i * a;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, debut, debut + a); ctx.closePath();
        let coul = COULEURS_ROUE[i % COULEURS_ROUE.length];
        if (n > 1 && i === n - 1 && coul === COULEURS_ROUE[0]) coul = COULEURS_ROUE[2];
        ctx.fillStyle = coul; ctx.fill();
        ctx.strokeStyle = "rgba(13,16,36,0.6)"; ctx.lineWidth = 3; ctx.stroke();
        ctx.save();
        ctx.rotate(debut + a / 2);
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        const clair = ["#e3b866", "#7fc8f8", "#f5d08a", "#8fb8de"].includes(coul);
        ctx.fillStyle = clair ? "#0d1024" : "#ffffff";
        const taille = Math.max(18, Math.min(44, 520 / n + 12));
        ctx.font = `600 ${taille}px "Cinzel", Georgia, serif`;
        let t = e.nom;
        const max = R - 90;
        while (ctx.measureText(t).width > max && t.length > 2) t = t.slice(0, -1);
        if (t !== e.nom) t = t.slice(0, -1) + "…";
        if (n <= 60) ctx.fillText(t, R - 24, 0);
        ctx.restore();
      });
      ctx.restore();
    };

    const majTout = () => {
      ecrireRoue(roue);
      dessinerNoms();
      dessinerRoue();
      const n = roue.length;
      $("#roue-compte").textContent = n ? `${n} nom${n > 1 ? "s" : ""} dans la roue` : "La roue est vide";
      $("#roue-lancer").disabled = n < 2;
    };

    $("#roue-filtre").oninput = dessinerNoms;
    $("#roue-tous").onclick = () => {
      if (enCours) return;
      persos.forEach((f) => { if (!dansRoue(f.id)) roue.push({ id: f.id, nom: f.titre }); });
      majTout();
    };
    $("#roue-vider").onclick = () => { if (!enCours && roue.length && confirm("Retirer tous les noms de la roue ?")) { roue = []; majTout(); } };
    $("#roue-ajout").onsubmit = (e) => {
      e.preventDefault();
      const nom = e.target.nom.value.trim();
      if (!nom || enCours) return;
      if (roue.some((x) => normal(x.nom) === normal(nom))) { toast("Ce nom est déjà dans la roue.", "erreur"); return; }
      roue.push({ nom }); e.target.nom.value = ""; majTout();
    };

    $("#roue-lancer").onclick = () => {
      if (enCours || roue.length < 2) return;
      enCours = true;
      $("#roue-lancer").disabled = true;
      const n = roue.length, seg = 360 / n;
      const hasard = crypto.getRandomValues(new Uint32Array(2));
      const gagnant = hasard[0] % n;
      const decalage = (hasard[1] / 4294967296 - 0.5) * seg * 0.7;
      const cible = (360 - ((gagnant + 0.5) * seg + decalage) + 3600) % 360;
      const actuel = ((rotation % 360) + 360) % 360;
      rotation += 360 * 6 + ((cible - actuel + 360) % 360);
      canvas.style.transition = "transform 5.5s cubic-bezier(0.12, 0.7, 0.1, 1)";
      canvas.style.transform = `rotate(${rotation}deg)`;
      setTimeout(() => { enCours = false; resultat(gagnant); }, 5700);
    };

    const resultat = (i) => {
      const e = roue[i];
      const fond = document.createElement("div");
      fond.className = "feuille-fond resultat-roue";
      fond.innerHTML = `
        <div class="carte-resultat">
          <div class="cr-titre">✧ La roue a choisi ✧</div>
          <div class="cr-nom">${esc(e.nom)}</div>
          ${e.id ? `<a class="lien" href="#/f/${encodeURIComponent(e.id)}">Voir sa fiche</a>` : ""}
          <div class="cr-boutons">
            <button class="btn btn-danger" id="cr-retirer">🗑 Retirer de la roue</button>
            <button class="btn btn-or" id="cr-garder">✔ Garder</button>
          </div>
        </div>`;
      document.body.appendChild(fond);
      requestAnimationFrame(() => fond.classList.add("ouvert"));
      const fermer = () => { fond.remove(); window.removeEventListener("hashchange", fermer); majTout(); };
      window.addEventListener("hashchange", fermer);
      $("#cr-garder", fond).onclick = fermer;
      $("#cr-retirer", fond).onclick = () => {
        roue.splice(i, 1);
        canvas.style.transition = "none";
        rotation = 0; canvas.style.transform = "rotate(0deg)";
        fermer();
      };
    };

    majTout();
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
      inscription: [pages.inscription], compte: [pages.compte], admin: [pages.admin], roue: [pages.roue], des: [pages.des], ia: [pages.ia],
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

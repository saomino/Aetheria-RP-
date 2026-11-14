// Combattant articulé 2D — v2 : style dark fantasy (manteaux, cheveux longs, cornes, ailes, auras)
(function () {
  const L = { tete: 17, cou: 7, torse: 44, bras1: 25, bras2: 24, cuisse: 34, tibia: 34 };
  const lerp = (a, b, k) => a + (b - a) * k;
  const rad = (d) => (d * Math.PI) / 180;
  const POSES = {
    garde: { hy: 0, tronc: 6, tete: -2, bdA: -72, bdB: 118, bgA: -38, bgB: 108, jdA: 16, jdB: -14, jgA: -14, jgB: -8 },
    poing: { hy: 0, tronc: 16, tete: -4, bdA: -92, bdB: 4, bgA: -28, bgB: 118, jdA: 26, jdB: -16, jgA: -24, jgB: -6 },
    pied: { hy: -2, tronc: -16, tete: 6, bdA: -50, bdB: 100, bgA: -60, bgB: 110, jdA: 96, jdB: -6, jgA: -10, jgB: -8 },
    accroupi: { hy: 30, tronc: 22, tete: -12, bdA: -70, bdB: 118, bgA: -40, bgB: 108, jdA: 82, jdB: -120, jgA: 10, jgB: -120 },
    saut: { hy: 0, tronc: 10, tete: -4, bdA: -110, bdB: 60, bgA: -60, bgB: 90, jdA: 70, jdB: -110, jgA: 30, jgB: -100 },
    touche: { hy: 2, tronc: -22, tete: 16, bdA: 30, bdB: 40, bgA: 50, bgB: 30, jdA: 10, jdB: -10, jgA: -24, jgB: -14 },
    special: { hy: 4, tronc: 10, tete: -2, bdA: -88, bdB: 0, bgA: -84, bgB: 6, jdA: 34, jdB: -24, jgA: -30, jgB: -4 },
    victoire: { hy: 0, tronc: -4, tete: -10, bdA: -170, bdB: 10, bgA: -30, bgB: 40, jdA: 12, jdB: -6, jgA: -12, jgB: -6 },
    bloc: { hy: 2, tronc: -4, tete: 4, bdA: -150, bdB: 150, bgA: -120, bgB: 130, jdA: 14, jdB: -12, jgA: -20, jgB: -6 },
    balayage: { hy: 34, tronc: 30, tete: -16, bdA: -40, bdB: 60, bgA: 20, bgB: 40, jdA: 100, jdB: -4, jgA: 10, jgB: -130 },
    aerien: { hy: 0, tronc: 20, tete: -6, bdA: -60, bdB: 80, bgA: -40, bgB: 100, jdA: 100, jdB: -20, jgA: 10, jgB: -110 },
    finish: { hy: 0, tronc: 4, tete: -6, bdA: -120, bdB: -10, bgA: -110, bgB: -6, jdA: 30, jdB: -20, jgA: -26, jgB: -8 },
  };
  function marche(t) {
    const s = Math.sin(t), c = Math.cos(t);
    return { hy: Math.abs(c) * -3, tronc: 8, tete: -2, bdA: -72 + s * 10, bdB: 118, bgA: -38 - s * 10, bgB: 108, jdA: 4 + s * 28, jdB: -10 - Math.max(0, -c) * 40, jgA: 4 - s * 28, jgB: -10 - Math.max(0, c) * 40 };
  }
  function melanger(a, b, k) { const o = {}; for (const c in a) o[c] = lerp(a[c], b[c], k); return o; }
  function teinte(c, f) {
    const m = /^#?([0-9a-f]{6})$/i.exec(c || ""); if (!m) return c;
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = (v) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
    return `rgb(${t(r)},${t(g)},${t(b)})`;
  }
  const sombre = (c) => teinte(c, 0.68), clair = (c) => teinte(c, 1.25);

  function segment(ctx, x, y, a, l) { return { x: x + Math.sin(rad(a)) * l, y: y + Math.cos(rad(a)) * l }; }
  function os(ctx, p1, p2, e1, e2, coul, contour = true) {
    const a = Math.atan2(p2.y - p1.y, p2.x - p1.x), n = a + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(p1.x + Math.cos(n) * e1 / 2, p1.y + Math.sin(n) * e1 / 2);
    ctx.lineTo(p2.x + Math.cos(n) * e2 / 2, p2.y + Math.sin(n) * e2 / 2);
    ctx.arc(p2.x, p2.y, e2 / 2, n, n + Math.PI);
    ctx.lineTo(p1.x - Math.cos(n) * e1 / 2, p1.y - Math.sin(n) * e1 / 2);
    ctx.arc(p1.x, p1.y, e1 / 2, n + Math.PI, n);
    ctx.closePath();
    ctx.fillStyle = coul; ctx.fill();
    if (contour) { ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1.6; ctx.stroke(); }
  }

  function ailes(ctx, st, x, y, temps) {
    const nb = st.ailesNb || 2, bat = Math.sin(temps * 3) * 0.1;
    const paires = nb >= 6 ? [[-0.95, 0.75], [-0.45, 1], [0.05, 0.8]] : [[-0.5, 1]];
    paires.forEach(([rot, k], i) => {
      for (const [cote, f] of [[1, 0.8], [0, 1]]) {
        ctx.save(); ctx.translate(x - 4, y + 10); ctx.rotate(rot + bat * (cote ? 1 : 0.7)); ctx.scale(k * f, k * f);
        const coul = cote === 1 && st.couleurAiles2 ? st.couleurAiles2 : st.couleurAiles || (st.ailes === "chauve" ? "#2a0a14" : "#f4f0ff");
        ctx.fillStyle = coul; ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (st.ailes === "chauve") { ctx.moveTo(0, 0); ctx.lineTo(-34, -60); ctx.lineTo(-74, -48); ctx.quadraticCurveTo(-60, -24, -66, 0); ctx.quadraticCurveTo(-48, -10, -42, 14); ctx.quadraticCurveTo(-24, 0, 0, 12); }
        else {
          ctx.moveTo(0, 0); ctx.quadraticCurveTo(-34, -82, -86, -70);
          for (let p = 0; p < 6; p++) { const t = p / 5; ctx.quadraticCurveTo(-86 + t * 30 - 14, -70 + t * 80 - 4, -82 + t * 34, -60 + t * 82); }
          ctx.quadraticCurveTo(-24, 14, 0, 14);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (st.veinesAiles) { ctx.strokeStyle = st.veinesAiles; ctx.shadowColor = st.veinesAiles; ctx.shadowBlur = 6; ctx.lineWidth = 1.4; for (let v = 0; v < 4; v++) { ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(-30 - v * 8, -30 + v * 10, -60 - v * 4, -40 + v * 22); ctx.stroke(); } ctx.shadowBlur = 0; }
        else if (st.ailes !== "chauve") { ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; for (let v = 0; v < 4; v++) { ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(-56 - v * 6, -44 + v * 24); ctx.stroke(); } }
        ctx.restore();
      }
    });
  }

  function cheveuxArriere(ctx, st, temps) {
    const lg = st.longueur || 0; if (!lg) return;
    const nb = 7, longueur = [0, 26, 52, 80][lg];
    for (let i = 0; i < nb; i++) {
      const k = i / (nb - 1), vent = Math.sin(temps * 2 + i * 0.7) * 5;
      const bx = -12 + k * 10, by = -10 + k * 4;
      ctx.fillStyle = i % 3 === 1 && st.meche ? st.meche : i % 2 ? st.cheveux : sombre(st.cheveux);
      ctx.beginPath(); ctx.moveTo(bx + 6, by - 4);
      const fin = st.boucle ? 6 : 0;
      ctx.quadraticCurveTo(bx - 14 - k * 10 + vent, by + longueur * 0.45, bx - 18 - k * 14 + vent * 1.6 + Math.sin(i) * fin, by + longueur);
      ctx.quadraticCurveTo(bx - 4 - k * 6 + vent, by + longueur * 0.5, bx + 10, by);
      ctx.closePath(); ctx.fill();
    }
  }
  function cheveuxAvant(ctx, st, temps) {
    ctx.fillStyle = st.cheveux; ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1.2;
    // calotte
    ctx.beginPath(); ctx.ellipse(-1, -6, 16.5, 14, 0, Math.PI * 0.95, Math.PI * 2.08); ctx.closePath(); ctx.fill();
    // mèches de frange
    const nbm = st.coiffure === "ebouriffe" ? 7 : 5;
    for (let i = 0; i < nbm; i++) {
      const k = i / (nbm - 1), ang = Math.PI * (1.05 + k * 0.95), r = 16;
      const x0 = Math.cos(ang) * r, y0 = -6 + Math.sin(ang) * r;
      const pointe = st.coiffure === "ebouriffe" ? 12 + (i % 2) * 6 : 9;
      ctx.fillStyle = i === 2 && st.meche ? st.meche : i === 4 && st.meche2 ? st.meche2 : st.cheveux;
      ctx.beginPath(); ctx.moveTo(x0 - 4, y0); ctx.quadraticCurveTo(x0 + 2, y0 + pointe * 0.4, x0 + 5 + (st.coiffure === "ebouriffe" ? Math.cos(ang) * 6 : 3), y0 + pointe); ctx.lineTo(x0 + 5, y0 - 2); ctx.closePath(); ctx.fill();
    }
    if (st.coiffure === "ebouriffe") for (let i = 0; i < 5; i++) { const a = Math.PI * (1.1 + i * 0.2); ctx.fillStyle = st.cheveux; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, -6 + Math.sin(a) * 12); ctx.lineTo(Math.cos(a + 0.12) * 26, -6 + Math.sin(a + 0.12) * 24); ctx.lineTo(Math.cos(a + 0.3) * 13, -6 + Math.sin(a + 0.3) * 13); ctx.fill(); }
    if (st.coiffure === "chignon") { ctx.fillStyle = st.cheveux; ctx.beginPath(); ctx.arc(-12, -16, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    // mèche qui tombe devant l'oreille
    if ((st.longueur || 0) >= 1) { ctx.fillStyle = st.meche && st.mecheDevant ? st.meche : st.cheveux; ctx.beginPath(); ctx.moveTo(-4, -12); ctx.quadraticCurveTo(-12, 6, -8, 22 + (st.longueur || 0) * 8); ctx.quadraticCurveTo(-4, 6, 2, -8); ctx.closePath(); ctx.fill(); }
  }

  function visage(ctx, st, temps, expression) {
    // oreilles derrière
    if (st.oreilles === "pointues" || st.oreilles === "nageoire") {
      ctx.fillStyle = st.oreilles === "nageoire" ? (st.nageoire || "#7ab0e0") : st.peau; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(st.oreilles === "nageoire" ? -24 : -20, -14); ctx.lineTo(st.oreilles === "nageoire" ? -20 : -6, st.oreilles === "nageoire" ? 2 : 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (st.oreilles === "nageoire") { ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-20, -11); ctx.moveTo(-8, 2); ctx.lineTo(-21, -4); ctx.stroke(); }
    }
    ctx.fillStyle = st.peau; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-12, -6); ctx.quadraticCurveTo(-13, 8, -4, 14); ctx.quadraticCurveTo(6, 19, 13, 9); ctx.quadraticCurveTo(15, -2, 12, -10); ctx.quadraticCurveTo(0, -18, -12, -6); ctx.fill(); ctx.stroke();
    // marques / tatouages
    if (st.marques) { ctx.strokeStyle = st.marques; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(3, -9); ctx.lineTo(8, -4); ctx.lineTo(5, 2); ctx.moveTo(8, -4); ctx.lineTo(12, -6); ctx.stroke(); }
    if (st.losange) { ctx.fillStyle = st.losange; ctx.beginPath(); ctx.moveTo(9, 2); ctx.lineTo(10.5, 5); ctx.lineTo(9, 9); ctx.lineTo(7.5, 5); ctx.fill(); }
    // œil (vue de profil 3/4) : grand œil anime
    const oeil = (x, coul, k) => {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(x, -3, 4 * k, 3.6 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = coul; if (st.yeuxBrillants) { ctx.shadowColor = coul; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.ellipse(x + 0.8, -2.6, 2.6 * k, 3.2 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(x + 1, -2.4, 1 * k, 1.8 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + 1.8, -4, 0.8 * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#140a10"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4 * k, -6.4); ctx.quadraticCurveTo(x, -8.4, x + 4.6 * k, -5.6); ctx.stroke();
      if (st.maquillage) { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.beginPath(); ctx.ellipse(x, -5, 5 * k, 2.2, 0, Math.PI, Math.PI * 2); ctx.fill(); }
    };
    oeil(1, st.yeux2 || st.yeux || "#4a3020", 0.75);
    oeil(8.5, st.yeux || "#4a3020", 1);
    // sourcil
    ctx.strokeStyle = sombre(st.cheveux); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(5, -10.5); ctx.lineTo(12.5, -9.5); ctx.stroke();
    // nez + bouche
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(14.5, 4); ctx.lineTo(12.5, 4.6); ctx.stroke();
    ctx.strokeStyle = st.levres || "rgba(110,40,40,0.8)"; ctx.lineWidth = st.levres ? 2.2 : 1.4;
    ctx.beginPath(); if (expression === "sourire" || st.sourire) { ctx.moveTo(6, 8.5); ctx.quadraticCurveTo(10, 11.5, 13, 8); } else { ctx.moveTo(7, 9.5); ctx.lineTo(12, 9); } ctx.stroke();
    if (st.crocs) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(10, 9.4); ctx.lineTo(10.8, 12); ctx.lineTo(11.6, 9.3); ctx.fill(); }
    if (st.barbe) { ctx.fillStyle = st.barbe; ctx.beginPath(); ctx.moveTo(6, 11); ctx.quadraticCurveTo(10, 18, 13, 11); ctx.quadraticCurveTo(10, 14, 6, 11); ctx.fill(); if (st.barbeCourte) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(-6, 6); ctx.quadraticCurveTo(2, 18, 13, 10); ctx.lineTo(10, 7); ctx.quadraticCurveTo(0, 12, -6, 6); ctx.fill(); ctx.globalAlpha = 1; } }
    if (st.monocle) { ctx.strokeStyle = "#d8b45a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(8.5, -3, 5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(8, 2); ctx.quadraticCurveTo(4, 14, 0, 22); ctx.stroke(); }
  }

  function accessoiresTete(ctx, st, temps) {
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.3;
    if (st.cornes === "oni") { ctx.fillStyle = st.couleurCornes || "#2a1a2a"; for (const dx of [-8, 4]) { ctx.beginPath(); ctx.moveTo(dx - 2.5, -16); ctx.quadraticCurveTo(dx + 2, -34, dx + 10, -40); ctx.quadraticCurveTo(dx + 5, -28, dx + 3.5, -15); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
    if (st.cornes === "belier") { ctx.fillStyle = st.couleurCornes || "#2a1a14"; for (const [dx, s] of [[-10, 0.85], [2, 1]]) { ctx.save(); ctx.translate(dx, -14); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(-3, 2); ctx.bezierCurveTo(-4, -18, 18, -22, 20, -6); ctx.bezierCurveTo(22, 8, 6, 12, 6, 2); ctx.bezierCurveTo(8, 6, 14, 2, 13, -5); ctx.bezierCurveTo(12, -14, 2, -12, 4, 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); } }
    if (st.chat) { const c = st.cheveux; for (const dx of [-12, 2]) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(dx - 5, -14); ctx.lineTo(dx + 1, -32); ctx.lineTo(dx + 8, -15); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = st.chatInterieur || "#a02030"; ctx.beginPath(); ctx.moveTo(dx - 2, -16); ctx.lineTo(dx + 1, -27); ctx.lineTo(dx + 5, -16); ctx.fill(); } }
    if (st.couronne) {
      ctx.fillStyle = st.couronne; ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath(); ctx.moveTo(-14, -15); for (let i = 0; i <= 6; i++) { const x = -14 + i * 4.6; ctx.lineTo(x, -15 - (i % 2 ? 12 : 5)); } ctx.lineTo(14, -15); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (st.gemme) { ctx.fillStyle = st.gemme; ctx.shadowColor = st.gemme; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(0, -19, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
    }
    if (st.bouffon) {
      const cols = st.bouffon;
      for (const [ang, c] of [[-2.3, cols[0]], [-0.9, cols[1]]]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-10, -14); ctx.quadraticCurveTo(Math.cos(ang) * 30, -24 + Math.sin(ang) * 18, Math.cos(ang) * 34, -6 + Math.sin(ang) * 4); ctx.quadraticCurveTo(Math.cos(ang) * 18, -14, 10, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#e3b866"; ctx.beginPath(); ctx.arc(Math.cos(ang) * 34, -4 + Math.sin(ang) * 4, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = cols[0]; ctx.beginPath(); ctx.ellipse(0, -14, 16, 6, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (st.lunettes) { ctx.fillStyle = "#3a2a1a"; ctx.fillRect(-14, -17, 28, 4); for (const dx of [-6, 6]) { const g = ctx.createLinearGradient(dx - 5, -20, dx + 5, -12); g.addColorStop(0, "#ff5a8a"); g.addColorStop(0.5, "#5ad0ff"); g.addColorStop(1, "#c8ff5a"); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(dx, -16, 5.5, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#c8a050"; ctx.lineWidth = 1.5; ctx.stroke(); } }
    if (st.aureole) { ctx.strokeStyle = "#ffe58a"; ctx.lineWidth = 2.5; ctx.shadowColor = "#ffe58a"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.ellipse(-2, -34, 14, 4, -0.15, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; }
  }

  function arme(ctx, st, x, y, a, temps) {
    if (!st.arme) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-rad(a) + Math.PI);
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1.3;
    const lueur = (c) => { ctx.shadowColor = c; ctx.shadowBlur = 12; };
    switch (st.arme) {
      case "epee": case "epee_sang": case "epee_noire": {
        const lame = st.arme === "epee_sang" ? "#ff2a3a" : st.arme === "epee_noire" ? "#2a1a2a" : "#e8eef8";
        if (st.arme === "epee_sang") lueur("#ff2a3a");
        ctx.fillStyle = lame; ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(-3, -58); ctx.lineTo(0, -66); ctx.lineTo(3, -58); ctx.lineTo(3, -5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = st.garde || "#c0c4d0"; ctx.fillRect(-9, -6, 18, 4); ctx.fillStyle = "#2a1a1a"; ctx.fillRect(-2, -2, 4, 9); break;
      }
      case "faux": {
        ctx.strokeStyle = "#1a1418"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, -60); ctx.stroke();
        lueur(st.aura || "#ff4a2a"); ctx.fillStyle = "#2a2028"; ctx.beginPath(); ctx.moveTo(0, -56); ctx.quadraticCurveTo(-34, -60, -48, -30); ctx.quadraticCurveTo(-30, -48, 0, -46); ctx.fill(); ctx.strokeStyle = st.aura || "#ff4a2a"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.shadowBlur = 0; break;
      }
      case "lance": {
        ctx.strokeStyle = "#1a1418"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, -56); ctx.stroke();
        lueur(st.aura || "#ff2a3a"); ctx.fillStyle = st.aura || "#ff2a3a"; ctx.beginPath(); ctx.moveTo(-5, -54); ctx.lineTo(0, -86); ctx.lineTo(5, -54); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; break;
      }
      case "trident": {
        ctx.strokeStyle = "#c8e0f0"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, -56); ctx.stroke();
        ctx.strokeStyle = "#d8b45a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-10, -52); ctx.lineTo(-10, -70); ctx.moveTo(0, -56); ctx.lineTo(0, -78); ctx.moveTo(10, -52); ctx.lineTo(10, -70); ctx.moveTo(-10, -52); ctx.quadraticCurveTo(0, -46, 10, -52); ctx.stroke();
        lueur("#5ad0ff"); ctx.fillStyle = "#5ad0ff"; ctx.beginPath(); ctx.arc(0, -52, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; break;
      }
      case "baton": case "canne": {
        ctx.strokeStyle = st.arme === "canne" ? "#1a1418" : "#5a3a2a"; ctx.lineWidth = st.arme === "canne" ? 2.5 : 3.5; ctx.beginPath(); ctx.moveTo(0, st.arme === "canne" ? 46 : 28); ctx.lineTo(0, -40); ctx.stroke();
        ctx.fillStyle = st.arme === "canne" ? "#c8a050" : st.aura || "#a8ff9a"; if (st.arme !== "canne") lueur(ctx.fillStyle);
        ctx.beginPath(); ctx.arc(0, -42, st.arme === "canne" ? 3.5 : 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; break;
      }
      case "livre": { ctx.rotate(Math.PI / 2); ctx.fillStyle = st.couleurLivre || "#2a1a1a"; ctx.fillRect(-9, -6, 18, 22); ctx.strokeRect(-9, -6, 18, 22); ctx.fillStyle = "#e3b866"; ctx.fillRect(-6, 0, 12, 2); lueur(st.aura || "#ff8a2a"); ctx.fillStyle = st.aura || "#ff8a2a"; ctx.beginPath(); ctx.arc(0, 6, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; break; }
      case "cartes": { for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(-0.4 + i * 0.35); ctx.fillStyle = "#f4ead0"; ctx.fillRect(-5, -26, 10, 15); ctx.strokeRect(-5, -26, 10, 15); ctx.fillStyle = i % 2 ? "#c0102a" : "#1a1a1a"; ctx.font = "8px serif"; ctx.fillText(["♠", "♥", "♦"][i], -3, -16); ctx.restore(); } break; }
      case "griffes": { ctx.strokeStyle = "#f0f0f0"; ctx.lineWidth = 1.8; for (const d of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(d, -4); ctx.lineTo(d * 1.6, -18); ctx.stroke(); } break; }
    }
    ctx.restore();
  }

  const DEFAUTS = { peau: "#e8c8b0", cheveux: "#2a2030", haut: "#3a2a4a", pantalon: "#1a1420", bottes: "#100a0e" };
  function dessiner(ctx, st0, p, temps, expression) {
    const st = Object.assign({}, DEFAUTS, st0);
    for (const k in DEFAUTS) if (!st[k]) st[k] = DEFAUTS[k];
    const k = st.taille || 1, F = !!st.femme;
    ctx.save(); ctx.scale(k, k);
    const hx = 0, hy = -(L.cuisse + L.tibia) + p.hy;
    const tr = rad(p.tronc);
    const ex = hx + Math.sin(tr) * L.torse, ey = hy - Math.cos(tr) * L.torse;
    const larg = (F ? 0.86 : 1) + (st.carrure || 0) * 0.18;
    // aura au sol
    if (st.aura) { ctx.save(); ctx.globalAlpha = 0.18 + Math.sin(temps * 3) * 0.05; ctx.fillStyle = st.aura; ctx.beginPath(); ctx.ellipse(0, -50, 46, 80, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    if (st.ailes) ailes(ctx, st, ex, ey, temps);
    // manteau : pan arrière
    const vent = Math.sin(temps * 2.2) * 6 + (p.hy < -1 ? 8 : 0);
    if (st.manteau) {
      const bas = hy + (st.manteauLong ? 62 : 40);
      ctx.fillStyle = sombre(st.manteau); ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ex - 10 * larg, ey + 2); ctx.quadraticCurveTo(hx - 26 + vent, hy + 6, hx - 30 + vent * 1.6, bas); ctx.lineTo(hx + 4, bas - 4); ctx.lineTo(hx + 4, hy); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (st.doublure) { ctx.strokeStyle = st.doublure; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(hx - 30 + vent * 1.6, bas); ctx.lineTo(hx + 4, bas - 4); ctx.stroke(); }
    }
    if (st.queue) { ctx.strokeStyle = st.queue; ctx.lineWidth = 5; ctx.lineCap = "round"; const q = Math.sin(temps * 3) * 10; ctx.beginPath(); ctx.moveTo(hx - 4, hy + 4); ctx.quadraticCurveTo(hx - 36, hy + 12 + q, hx - 50, hy - 18 + q); ctx.stroke(); ctx.fillStyle = st.queue; ctx.beginPath(); ctx.moveTo(hx - 50, hy - 18 + q); ctx.lineTo(hx - 60, hy - 26 + q); ctx.lineTo(hx - 52, hy - 8 + q); ctx.fill(); }
    // cheveux arrière (derrière le corps)
    const tx = ex + Math.sin(tr) * L.cou, ty = ey - Math.cos(tr) * L.cou;
    const teteRot = rad(p.tete) + tr * 0.4;
    ctx.save(); ctx.translate(tx, ty - L.tete + 2); ctx.rotate(teteRot); cheveuxArriere(ctx, st, temps); ctx.restore();
    // membres arrière
    const jambe = (a1, a2, arr) => {
      const g = segment(ctx, hx, hy, a1, L.cuisse), pied = segment(ctx, g.x, g.y, a1 + a2, L.tibia);
      const cp = arr ? sombre(st.pantalon) : st.pantalon, cb = arr ? sombre(st.bottes) : st.bottes;
      os(ctx, { x: hx, y: hy }, g, 13 * larg, 11 * larg, cp);
      os(ctx, g, pied, 11 * larg, 9 * larg, st.bottesHautes ? cb : cp);
      if (!st.bottesHautes) { const m = { x: lerp(g.x, pied.x, 0.55), y: lerp(g.y, pied.y, 0.55) }; os(ctx, m, pied, 10 * larg, 9.5 * larg, cb); }
      if (st.jambieres) { const m = { x: lerp(g.x, pied.x, 0.15), y: lerp(g.y, pied.y, 0.15) }; os(ctx, m, { x: lerp(g.x, pied.x, 0.7), y: lerp(g.y, pied.y, 0.7) }, 12 * larg, 11 * larg, arr ? sombre(st.jambieres) : st.jambieres); }
      ctx.fillStyle = cb; ctx.beginPath(); ctx.ellipse(pied.x + 5, pied.y + 1, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.stroke();
    };
    const bras = (a1, a2, arr, avecArme) => {
      const ep = { x: ex, y: ey + 5 }, cou = segment(ctx, ep.x, ep.y, a1, L.bras1), main = segment(ctx, cou.x, cou.y, a1 + a2, L.bras2);
      const manche = st.manches || st.manteau || st.haut;
      os(ctx, ep, cou, 11 * larg, 10 * larg, arr ? sombre(st.brasNus ? st.peau : manche) : st.brasNus ? st.peau : manche);
      os(ctx, cou, main, 10 * larg, 8 * larg, arr ? sombre(st.brasNus ? st.peau : manche) : st.brasNus ? st.peau : manche);
      if (st.jabot) { ctx.fillStyle = "#f4f0ea"; ctx.beginPath(); ctx.arc(main.x, main.y, 6, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = st.gants ? (arr ? sombre(st.gants) : st.gants) : arr ? sombre(st.peau) : st.peau;
      ctx.beginPath(); ctx.arc(main.x, main.y, 5 * larg, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.2; ctx.stroke();
      if (avecArme) arme(ctx, st, main.x, main.y, a1 + a2, temps);
      if (st.mainMagique && !arr) { ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(main.x, main.y, 0, main.x, main.y, 16); g.addColorStop(0, "#fff"); g.addColorStop(0.3, st.aura || "#ff2a3a"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(main.x, main.y, 16 + Math.sin(temps * 6) * 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      return main;
    };
    jambe(p.jgA, p.jgB, true);
    bras(p.bgA - p.tronc, p.bgB, true, st.deuxArmes);
    jambe(p.jdA, p.jdB, false);
    // robe longue (par-dessus les jambes)
    if (st.robe) {
      const piedD = segment(ctx, ...Object.values(segment(ctx, hx, hy, p.jdA, L.cuisse)), p.jdA + p.jdB, L.tibia);
      const piedG = segment(ctx, ...Object.values(segment(ctx, hx, hy, p.jgA, L.cuisse)), p.jgA + p.jgB, L.tibia);
      const bas = Math.max(piedD.y, piedG.y) - 6;
      ctx.fillStyle = st.robe; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx - 12 * larg, hy - 6); ctx.lineTo(hx + 12 * larg, hy - 6);
      ctx.quadraticCurveTo(Math.max(piedD.x, piedG.x) + 8, hy + 30, Math.max(piedD.x, piedG.x) + 10, bas);
      for (let i = 0; i <= 5; i++) { const x = lerp(Math.max(piedD.x, piedG.x) + 10, Math.min(piedD.x, piedG.x) - 12 + vent * 0.5, i / 5); ctx.lineTo(x, bas + (i % 2 ? 4 : 0)); }
      ctx.quadraticCurveTo(Math.min(piedD.x, piedG.x) - 10, hy + 30, hx - 12 * larg, hy - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (st.robeMotif) { ctx.strokeStyle = st.robeMotif; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx + 2, hy); ctx.lineTo(hx + 4, bas - 2); ctx.stroke(); }
    }
    // torse
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(tr);
    const g = ctx.createLinearGradient(-14, -L.torse, 14, 0); g.addColorStop(0, clair(st.haut)); g.addColorStop(1, sombre(st.haut));
    ctx.fillStyle = g; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-(F ? 9 : 11) * larg, 0); ctx.quadraticCurveTo(-(F ? 8 : 12) * larg, -L.torse * 0.5, -15 * larg, -L.torse + 6); ctx.quadraticCurveTo(0, -L.torse - 4, 15 * larg, -L.torse + 6); ctx.quadraticCurveTo((F ? 8 : 12) * larg, -L.torse * 0.5, (F ? 9 : 11) * larg, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (st.torseNu) { ctx.fillStyle = st.peau; ctx.beginPath(); ctx.moveTo(2, -L.torse + 4); ctx.lineTo(12 * larg, -L.torse + 6); ctx.lineTo(9 * larg, -6); ctx.lineTo(4, -10); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.moveTo(6, -30); ctx.lineTo(10, -30); ctx.moveTo(6, -22); ctx.lineTo(10, -22); ctx.stroke(); if (st.tatouage) { ctx.strokeStyle = st.tatouage; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(4, -36); ctx.lineTo(9, -28); ctx.lineTo(6, -18); ctx.stroke(); } }
    if (F) { ctx.fillStyle = clair(st.haut); ctx.beginPath(); ctx.ellipse(9 * larg, -L.torse + 16, 6, 5, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.stroke(); }
    if (st.jabot) { ctx.fillStyle = "#f4f0ea"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(9, -L.torse + 8 + i * 6, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill(); } }
    if (st.damier) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = st.damier; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2) ctx.fillRect(-10 + j * 7, -L.torse + 8 + i * 8, 7, 8); ctx.restore(); }
    if (st.chaines) { ctx.strokeStyle = st.chaines; ctx.lineWidth = 1.3; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(-12, -L.torse + 8); ctx.quadraticCurveTo(0, -L.torse + 22, 12, -L.torse + 8); ctx.moveTo(-10, -12); ctx.quadraticCurveTo(0, -4, 10, -14); ctx.stroke(); ctx.setLineDash([]); }
    if (st.armure) { ctx.fillStyle = st.armure; ctx.beginPath(); ctx.ellipse(-2, -L.torse + 6, 14 * larg, 7, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (st.fourrure) { ctx.fillStyle = st.fourrure; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-14 + i * 3.4, -L.torse + 4 + Math.sin(i * 1.7) * 2, 4.5, 0, Math.PI * 2); ctx.fill(); } }
    if (st.manteau) { // revers du manteau sur le torse
      ctx.fillStyle = st.manteau; ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath(); ctx.moveTo(-15 * larg, -L.torse + 6); ctx.lineTo(-4, -L.torse + 4); ctx.lineTo(-2, 0); ctx.lineTo(-11 * larg, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (st.doublure) { ctx.strokeStyle = st.doublure; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -L.torse + 4); ctx.lineTo(-2, 0); ctx.stroke(); }
      if (st.col) { ctx.fillStyle = st.manteau; ctx.beginPath(); ctx.moveTo(-14, -L.torse + 6); ctx.lineTo(-8, -L.torse - 10); ctx.lineTo(2, -L.torse + 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    ctx.fillStyle = st.ceinture || "#2a1a14"; ctx.fillRect(-12 * larg, -9, 24 * larg, 4.5);
    if (st.boucle) { ctx.fillStyle = "#c8c8d0"; ctx.fillRect(4, -10, 6, 6.5); }
    ctx.restore();
    // pan avant du manteau (flotte)
    if (st.manteau) {
      const bas = hy + (st.manteauLong ? 58 : 38);
      ctx.fillStyle = st.manteau; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx - 2, hy - 8); ctx.lineTo(hx + 10 * larg, hy - 6); ctx.quadraticCurveTo(hx + 12 - vent * 0.3, hy + 20, hx + 6 - vent * 0.4, bas); ctx.lineTo(hx - 8 + vent * 0.2, bas + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (st.doublure) { ctx.strokeStyle = st.doublure; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + 10 * larg, hy - 6); ctx.quadraticCurveTo(hx + 12 - vent * 0.3, hy + 20, hx + 6 - vent * 0.4, bas); ctx.stroke(); }
    }
    // cou + tête
    os(ctx, { x: ex, y: ey }, { x: tx, y: ty }, 8, 8, st.peau);
    ctx.save(); ctx.translate(tx + 1, ty - L.tete + 3); ctx.rotate(teteRot);
    visage(ctx, st, temps, expression);
    cheveuxAvant(ctx, st, temps);
    accessoiresTete(ctx, st, temps);
    ctx.restore();
    if (st.collier) { ctx.fillStyle = st.collier; ctx.save(); ctx.translate(ex, ey); ctx.rotate(tr); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-6 + i * 3, -2); ctx.lineTo(-5 + i * 3, -7); ctx.lineTo(-4 + i * 3, -2); ctx.fill(); } ctx.restore(); }
    const poing = bras(p.bdA - p.tronc, p.bdB, false, true);
    ctx.restore();
    return { x: poing.x * k, y: poing.y * k };
  }
  window.COMBATTANT = { dessiner, POSES, marche, melanger };
})();

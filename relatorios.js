/* Relatórios do Campo3D (botão "Relatórios" na barra de ferramentas):
   1) PDF "Resumo da produção": avanço em kg e %, por camada, por dia, problemas abertos com foto, imagem do 3D.
   2) Vídeo "Evolução da produção": o mesmo padrão dos vídeos diários (fundo escuro, estrutura fantasma em cinza,
      peças montadas azuis empilhadas ao lado do prédio, levantadas em verde, DIA a DIA, contadores), gravado
      no próprio aparelho (MediaRecorder) em 9:16 para mandar no WhatsApp.
   Sem valores em R$: o app ainda não tem login. Lê os dados do index.html por window.CAMPO. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- ajustes da obra (vídeo) ---------- */
const VID = {
  tag: 'OBRA AMAGGI  ·  LIGHT STEEL FRAME',
  juntar: { '2026-10-26': '2026-10-27' },   // 26/10 foi organização: conta junto com 27/10 como DIA 1
  distribuicao: '2026-11-02',                // dia em que a pilha vai deitada para o lugar de cada painel
  dur: 19.5,
};
const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';

const C = () => window.CAMPO;
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const fmt1 = (n) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hoje = () => new Date().toLocaleDateString('sv-SE');
const brData = (d) => d ? d.split('-').reverse().join('/') : '';
const nomeObra = () => (document.querySelector('.brand .mark')?.textContent || 'Obra').trim();

/* ---------- dados ---------- */
function dados(){
  const c = C(), pl = c.plano();
  return c.PECAS.map((p) => {
    const e = c.etapa(p.code), s = c.estado(p.code) || {};
    const lev = pl.pecas?.[p.code]?.levantado || ((e === 2 || e === 4) && s.em ? c.diaLocal(s.em) : null);
    return { code: p.code, grupo: p.grupo, kg: c.kg(p.code) || 0, etapa: e, montado: c.montado(p.code), dia: c.montadoEm(p.code), lev, est: s };
  });
}
const NOME_GRUPO = (g) => (C().GRUPOS.find((x) => x.id === g) || {}).nome || g;

/* ---------- interface ---------- */
const css = document.createElement('style');
css.textContent = `
#rel{position:fixed;inset:0;z-index:60;background:rgba(10,14,24,.55);display:flex;align-items:flex-end;justify-content:center}
#rel[hidden]{display:none}
#rel .box{background:#fff;border-radius:16px 16px 0 0;width:min(560px,100%);padding:18px 18px 22px;box-shadow:0 -8px 30px rgba(0,0,0,.25);font-family:"Public Sans",sans-serif}
@media (min-width:600px){#rel{align-items:center}#rel .box{border-radius:16px}}
#rel h3{font-family:"Archivo",sans-serif;font-size:18px;margin:0 0 4px}
#rel p.sub{margin:0 0 14px;color:#5b6478;font-size:13px}
#rel .op{display:flex;gap:12px;align-items:center;width:100%;text-align:left;border:1px solid #dfe3ea;background:#f7f9fc;border-radius:12px;padding:12px 14px;margin:8px 0;cursor:pointer;font:inherit}
#rel .op b{display:block;font-size:15px}#rel .op span{color:#5b6478;font-size:12.5px}
#rel .op svg{width:28px;height:28px;flex:none;stroke:#0f1626;fill:none;stroke-width:1.8}
#rel .x{position:absolute;right:14px;top:10px;border:0;background:none;font-size:26px;cursor:pointer}
#rel .rel-in{position:relative}
#rel .prog{margin-top:12px;font-size:13px;color:#0f1626}
#rel .prog i{display:block;height:6px;border-radius:3px;background:#4ea3ff;width:0;transition:width .2s}
#rel .prog .bar{background:#e8edf4;border-radius:3px;margin-top:6px;overflow:hidden}
#rel video{width:100%;max-height:52vh;border-radius:10px;background:#0d1220;margin-top:10px}
#rel .acts{display:flex;gap:8px;margin-top:10px}#rel .acts a,#rel .acts button{flex:1;text-align:center;padding:11px;border-radius:10px;border:1px solid #0f1626;background:#0f1626;color:#fff;font:600 14px "Public Sans",sans-serif;text-decoration:none;cursor:pointer}
#rel .acts .sec{background:#fff;color:#0f1626}
#rel canvas.prev{width:100%;max-height:52vh;object-fit:contain;border-radius:10px;background:#0d1220;margin-top:10px}`;
document.head.appendChild(css);
const dlg = document.createElement('div'); dlg.id = 'rel'; dlg.hidden = true;
dlg.innerHTML = `<div class="box"><div class="rel-in"><button class="x" id="rel-x" aria-label="Fechar">×</button>
<h3>Relatórios da obra</h3><p class="sub">Gerados com os dados de agora, neste aparelho.</p>
<button class="op" id="rel-pdf"><svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg><div><b>PDF do resumo da produção</b><span>Avanço em kg e %, por camada, por dia e problemas com foto</span></div></button>
<button class="op" id="rel-vid"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg><div><b>Vídeo da evolução</b><span>Timelapse 3D dia a dia, vertical, para o WhatsApp (~20 s)</span></div></button>
<div id="rel-out"></div></div></div>`;
document.body.appendChild(dlg);
const out = (h) => { $('rel-out').innerHTML = h; };
$('rel-x').onclick = () => { if (!gravando) dlg.hidden = true; };
dlg.addEventListener('click', (e) => { if (e.target === dlg && !gravando) dlg.hidden = true; });
$('b-rel')?.addEventListener('click', () => { out(''); dlg.hidden = false; });
$('rel-pdf').onclick = () => gerarPDF().catch((e) => out(`<div class="prog">Não foi possível gerar o PDF: ${e.message}</div>`));
$('rel-vid').onclick = () => gerarVideo().catch((e) => { gravando = false; out(`<div class="prog">Não foi possível gerar o vídeo: ${e.message}</div>`); });

/* ============================== PDF ============================== */
function carregarScript(src){
  return new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('sem internet para baixar o gerador de PDF')); document.head.appendChild(s); });
}
async function imgData(url, max = 600){
  try {
    const r = await fetch(url); if (!r.ok) return null; const b = await r.blob();
    const im = await createImageBitmap(b); const k = Math.min(1, max / Math.max(im.width, im.height));
    const cv = document.createElement('canvas'); cv.width = im.width * k; cv.height = im.height * k;
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); return { d: cv.toDataURL('image/jpeg', 0.82), w: cv.width, h: cv.height };
  } catch { return null; }
}
async function gerarPDF(){
  out('<div class="prog">Montando o PDF…</div>');
  if (!window.jspdf) await carregarScript(JSPDF);
  const { jsPDF } = window.jspdf;
  const c = C(), L = dados();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14; let y = 16;
  const ink = [15, 22, 38], mut = [91, 100, 120], blue = [47, 127, 224], red = [196, 60, 60], line = [223, 227, 234];
  const T = (t, x, yy, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 10); doc.setTextColor(...(o.c || ink)); doc.text(String(t), x, yy, o.a ? { align: o.a } : undefined); };
  const novaPag = (h) => { if (y + h > 285) { doc.addPage(); y = 16; } };
  const totKg = L.reduce((a, p) => a + p.kg, 0), montKg = L.filter((p) => p.montado).reduce((a, p) => a + p.kg, 0);
  const pct = totKg ? montKg / totKg : 0;
  const n = (f) => L.filter(f).length;

  T(nomeObra().toUpperCase(), M, y, { s: 9, b: 1, c: blue }); y += 7;
  T('Resumo da produção', M, y, { s: 20, b: 1 }); y += 6;
  T(`Gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${c.nome() ? ' por ' + c.nome() : ''}`, M, y, { s: 9, c: mut }); y += 8;

  // indicadores
  const kpis = [[`${fmt(montKg)} kg`, `de ${fmt(totKg)} kg montados`], [`${Math.round(pct * 100)}%`, 'do aço montado'],
    [`${n((p) => p.montado)}/${L.length}`, 'peças montadas'], [`${n((p) => p.etapa === 4)}`, 'conferidas'], [`${n((p) => p.etapa === 5)}`, 'com problema']];
  const kw = (W - 2 * M - 4 * 3) / 5;
  kpis.forEach(([v, l], i) => { const x = M + i * (kw + 3); doc.setDrawColor(...line); doc.setFillColor(247, 249, 252); doc.roundedRect(x, y, kw, 18, 2, 2, 'FD'); T(v, x + 3, y + 8, { s: 12, b: 1, c: i === 4 && v !== '0' ? red : ink }); T(l, x + 3, y + 14, { s: 7.5, c: mut }); });
  y += 22;
  doc.setFillColor(232, 237, 244); doc.roundedRect(M, y, W - 2 * M, 3, 1.5, 1.5, 'F');
  if (pct > 0) { doc.setFillColor(...blue); doc.roundedRect(M, y, (W - 2 * M) * pct, 3, 1.5, 1.5, 'F'); }
  y += 8;

  // imagem do 3D (vista atual)
  try {
    c.renderer.render(c.scene, c.camera);
    const src = c.renderer.domElement, k = Math.min(1, 900 / src.width);
    const cv = document.createElement('canvas'); cv.width = src.width * k; cv.height = src.height * k;
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    const h = Math.min(80, (W - 2 * M) * cv.height / cv.width), w = h * cv.width / cv.height;
    doc.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', M + (W - 2 * M - w) / 2, y, w, h); y += h + 6;
  } catch {}

  // tabela genérica
  const tabela = (tit, cab, linhas, larg, esq = [0]) => {   // esq: colunas alinhadas à esquerda
    const X = (i) => esq.includes(i) ? xs[i] : xs[i] + larg[i] - 1, A = (i) => esq.includes(i) ? undefined : 'right';
    novaPag(16 + 7 * Math.min(linhas.length, 4)); T(tit, M, y, { s: 12, b: 1 }); y += 5;
    const xs = []; let x = M; larg.forEach((l) => { xs.push(x); x += l; });
    doc.setDrawColor(...ink); doc.setLineWidth(0.4); doc.line(M, y + 1.5, W - M, y + 1.5);
    cab.forEach((h, i) => T(h, X(i), y, { s: 7.5, b: 1, c: mut, a: A(i) })); y += 6;
    doc.setLineWidth(0.2); doc.setDrawColor(...line);
    linhas.forEach((ln, r) => {
      novaPag(7);
      ln.forEach((v, i) => T(v, X(i), y, { s: 9, b: r === linhas.length - 1 && ln[0] === 'Total', a: A(i) })); y += 2; doc.line(M, y, W - M, y); y += 4.5;
    });
    y += 4;
  };
  // por camada
  const gs = [...new Set(L.map((p) => p.grupo))];
  const lc = gs.map((g) => { const G = L.filter((p) => p.grupo === g); const kt = G.reduce((a, p) => a + p.kg, 0), km = G.filter((p) => p.montado).reduce((a, p) => a + p.kg, 0);
    return [NOME_GRUPO(g), G.length, G.filter((p) => p.montado).length, G.filter((p) => p.etapa === 2 || p.etapa === 4).length, G.filter((p) => p.etapa === 4).length, G.filter((p) => p.etapa === 5).length, `${fmt(km)} / ${fmt(kt)}`]; });
  lc.push(['Total', L.length, n((p) => p.montado), n((p) => p.etapa === 2 || p.etapa === 4), n((p) => p.etapa === 4), n((p) => p.etapa === 5), `${fmt(montKg)} / ${fmt(totKg)}`]);
  tabela('Por camada', ['Camada', 'Peças', 'Montadas', 'Levantadas', 'Conferidas', 'Problema', 'kg montado / total'], lc, [46, 16, 20, 22, 22, 20, 36]);
  // por dia
  const dias = [...new Set(L.filter((p) => p.dia).map((p) => p.dia))].sort();
  let ac = 0;
  const ld = dias.map((d) => { const D = L.filter((p) => p.dia === d); const k = D.reduce((a, p) => a + p.kg, 0); ac += k;
    const porG = gs.map((g) => [g, D.filter((p) => p.grupo === g).length]).filter((x) => x[1]).map(([g, q]) => `${q} ${NOME_GRUPO(g).split(' ')[0].toLowerCase()}`).join(', ');
    return [brData(d), porG, fmt(k), fmt(ac), `${totKg ? Math.round(ac / totKg * 100) : 0}%`]; });
  if (ld.length) tabela('Por dia', ['Data', 'Peças montadas', 'kg no dia', 'kg acumulado', '% do total'], ld, [24, 82, 24, 26, 26], [0, 1]);
  // problemas
  const probs = L.filter((p) => p.etapa === 5);
  novaPag(14); T(`Problemas abertos (${probs.length})`, M, y, { s: 12, b: 1 }); y += 6;
  if (!probs.length) { T('Nenhum problema aberto.', M, y, { s: 9, c: mut }); y += 6; }
  for (const p of probs) {
    const s = p.est || {}; const fotos = (s.fotos || []).slice(0, 2);
    const imgs = []; for (const f of fotos) { const im = await imgData(c.fotoUrl(f)); if (im) imgs.push(im); }
    const nota = doc.splitTextToSize(s.nota || '(sem descrição)', W - 2 * M - (imgs.length ? 64 : 0));
    const h = Math.max(10 + nota.length * 4.2, imgs.length ? 32 : 0);
    novaPag(h + 4);
    doc.setDrawColor(240, 190, 190); doc.setFillColor(253, 244, 244); doc.roundedRect(M, y - 4, W - 2 * M, h, 2, 2, 'FD');
    T(`${p.code} · ${NOME_GRUPO(p.grupo)}`, M + 3, y + 1, { s: 10, b: 1, c: red });
    T(`${s.autor || ''}${s.em ? ' · ' + new Date(s.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}`, M + 3, y + 5.5, { s: 8, c: mut });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink); doc.text(nota, M + 3, y + 10.5);
    let ix = W - M - 3;
    for (const im of imgs.reverse()) { const ih = 26, iw = ih * im.w / im.h; ix -= iw; doc.addImage(im.d, 'JPEG', ix, y - 1, iw, ih); ix -= 3; }
    y += h + 3;
  }
  // rodapé
  const np = doc.getNumberOfPages();
  for (let i = 1; i <= np; i++) { doc.setPage(i); T(`${nomeObra()} · Resumo da produção · ${brData(hoje())}`, M, 291, { s: 7.5, c: mut }); T(`${i}/${np}`, W - M, 291, { s: 7.5, c: mut, a: 'right' }); }
  const nomeArq = `Resumo_producao_${hoje()}.pdf`;
  const blob = doc.output('blob');
  entregar(blob, nomeArq, 'application/pdf');
}

/* ---------- entregar arquivo: compartilhar (celular) ou baixar ---------- */
let ultimoUrl = null;
function entregar(blob, nome, tipo, preview){
  if (ultimoUrl) URL.revokeObjectURL(ultimoUrl);
  const url = ultimoUrl = URL.createObjectURL(blob);
  const file = new File([blob], nome, { type: tipo });
  const podeShare = navigator.canShare && navigator.canShare({ files: [file] });
  out(`${preview || ''}<div class="prog">Pronto: ${nome} (${(blob.size / 1048576).toFixed(1)} MB)</div>
    <div class="acts">${podeShare ? '<button id="rel-share">Compartilhar</button>' : ''}<a id="rel-dl" class="${podeShare ? 'sec' : ''}" href="${url}" download="${nome}">Baixar</a></div>`);
  if (preview) { const v = $('rel-out').querySelector('video'); if (v) v.src = url; }
  $('rel-share') && ($('rel-share').onclick = () => navigator.share({ files: [file], title: nome }).catch(() => {}));
  window.__ultimoRelatorio = { nome, tipo, tamanho: blob.size, blob };
}

/* ============================== VÍDEO ============================== */
let gravando = false;
const VW = 720, VH = 1280, K = VW / 1080, GW = VW, GH = Math.round(1180 * K), FY = Math.round(380 * K);
const BGc = '#0d1220';
const COLK = { ext: 0xaab4c8, int: 0xaab4c8, PV2: 0xaab4c8, TS: 0xaab4c8, TR: 0x8f9bb0, LJ1: 0x6b7a99 };
const GOP = { ext: 0.9, int: 0.7, PV2: 0.8, TS: 0.3, TR: 0.22, LJ1: 0.22 };
const BLUE = new THREE.Color(0x4ea3ff), LIFT = new THREE.Color(0x3ee08f), WHITE = new THREE.Color(0xffffff);
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); };
const eio = (t) => { t = Math.max(0, Math.min(1, t)); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

let V = null;   // cena do vídeo, montada uma vez
function montarCena(){
  const c = C();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x223044, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(10, 25, 12); scene.add(dl);
  const BB = new THREE.Box3(), panels = {};
  c.paineis.forEach((info, code) => {
    const kind = info.grupo === 'PV1' ? ((info.cor || '').toLowerCase() === '#ff9999' ? 'ext' : 'int') : info.grupo;
    const arr = [];
    info.meshes.forEach((m) => {
      const o = m.userData.orig || m.material;
      // painéis: só o aço (vermelho/amarelo do projeto); fora vidro, portas e louças das aberturas
      if (info.grupo === 'PV1' && o?.color && !['ff9999', 'ffff00'].includes(o.color.getHexString(THREE.SRGBColorSpace))) return;
      m.updateWorldMatrix(true, false);
      // os GLB do app vêm quantizados (inteiros normalizados): converte para float ANTES de aplicar a posição no mundo
      let g = new THREE.BufferGeometry(); const pa = m.geometry.attributes.position;
      const f = new Float32Array(pa.count * 3); for (let i = 0; i < pa.count; i++) { f[i * 3] = pa.getX(i); f[i * 3 + 1] = pa.getY(i); f[i * 3 + 2] = pa.getZ(i); }
      g.setAttribute('position', new THREE.BufferAttribute(f, 3)); if (m.geometry.index) g.setIndex(m.geometry.index.clone());
      g.applyMatrix4(m.matrixWorld); if (g.index) g = g.toNonIndexed();
      arr.push(g);
    });
    if (!arr.length) return;
    const geo = mergeGeometries(arr, false); geo.computeBoundingBox(); BB.union(geo.boundingBox);
    const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLK[kind] ?? 0xaab4c8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    const bb = geo.boundingBox, pv = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
    const sg = geo.clone(); sg.translate(-pv.x, -pv.y, -pv.z); sg.computeBoundingBox();
    const solid = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: BLUE.clone(), metalness: .35, roughness: .45, side: THREE.DoubleSide, flatShading: true }));
    solid.position.copy(pv); solid.visible = false; scene.add(ghost, solid);
    const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z, sy = bb.max.y - bb.min.y;
    panels[code] = { ghost, solid, kind, pv, thinX: sx < sz, sy, thick: Math.min(sx, sz), stand: { q: new THREE.Quaternion(), p: pv.clone() } };
  });
  const ctr = BB.getCenter(new THREE.Vector3());
  // deitado no lugar: tomba em torno da aresta de baixo, topo para o centro do prédio
  Object.values(panels).forEach((P) => {
    const q = new THREE.Quaternion();
    if (P.thinX) { const s = Math.sign(ctr.x - P.pv.x) || 1; q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * Math.PI / 2); }
    else { const s = Math.sign(ctr.z - P.pv.z) || 1; q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s * Math.PI / 2); }
    P.lie = { q, p: new THREE.Vector3(P.pv.x, BB.min.y + P.thick / 2 + 0.03, P.pv.z) };
  });
  const grid = new THREE.GridHelper(80, 80, 0x1f2b44, 0x18223a); grid.position.set(ctr.x, BB.min.y, ctr.z); scene.add(grid);
  scene.fog = new THREE.Fog(0x0d1220, 70, 140);
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(GW, GH, false); r.setClearColor(0x0d1220, 1);
  const cam = new THREE.PerspectiveCamera(30, GW / GH, 0.1, 600);
  V = { scene, panels, BB, ctr, r, cam };
}

function boxAt(geo, q){ return geo.boundingBox.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)); }
function prepararLinha(){
  const L = dados(), by = Object.fromEntries(L.map((p) => [p.code, p]));
  const dk = (d) => d ? (VID.juntar[d] || d) : null;
  const dias = [...new Set(L.filter((p) => p.dia).map((p) => dk(p.dia)))].sort();
  const nd = dias.length;
  // linha do tempo: gancho até 3,6 s; dias dividem até ~15 s proporcional ao nº de peças; final 16 s; chamada 17 s
  const cnt = dias.map((d) => L.filter((p) => dk(p.dia) === d).length + L.filter((p) => dk(p.lev) === d).length);
  const span = Math.max(4, 12 - 0.3 * (nd - 1)), minA = Math.min(2, span / Math.max(1, nd) * 0.8);
  let al = cnt.map((n) => Math.max(minA, span * Math.max(n, 0.0001) / cnt.reduce((a, b) => a + b, 0)));
  const sc = span / al.reduce((a, b) => a + b, 0); al = al.map((a) => a * sc);
  let tc = 3.6; const jan = dias.map((d, i) => { const w = [d, tc, tc + al[i]]; tc += al[i] + 0.3; return w; });
  const P = V.panels, full = {};
  const ord = (ids) => ids.filter((k) => P[k]).sort((a, b) => P[a].kind.localeCompare(P[b].kind) || P[a].pv.x - P[b].pv.x || P[a].pv.z - P[b].pv.z);
  L.forEach((p) => { full[p.code] = { m: null, l: null, v: null }; });
  jan.forEach(([d, t0, t1]) => {
    const mont = ord(L.filter((p) => dk(p.dia) === d).map((p) => p.code));
    const loc = VID.distribuicao && d === dk(VID.distribuicao) ? ord(L.filter((p) => p.dia && p.dia < VID.distribuicao).map((p) => p.code)) : [];
    const lev = ord(L.filter((p) => dk(p.lev) === d).map((p) => p.code));
    const parts = [['m', mont], ['l', loc], ['v', lev]].filter((x) => x[1].length), tot = parts.reduce((a, x) => a + x[1].length, 0);
    let t = t0;
    parts.forEach(([k, ids]) => { const len = (t1 - t0) * ids.length / tot, w = Math.max(0.01, len - (k === 'm' ? 0.5 : 1.0));
      ids.forEach((id, i) => { full[id][k] = t + w * (ids.length > 1 ? i / (ids.length - 1) : 0); }); t += len; });
  });
  L.forEach((p) => { if (full[p.code].m != null && VID.distribuicao && p.dia >= VID.distribuicao) full[p.code].l = full[p.code].m; });
  // peças sem 3D entram nos contadores no fim do seu dia
  jan.forEach(([d, , t1]) => L.forEach((p) => { if (dk(p.dia) === d && full[p.code].m == null) full[p.code].m = t1 - 0.5; }));
  // pilhas: painéis na frente; 2ª fileira: cobertura e treliças
  const ids = Object.keys(full).filter((id) => P[id] && full[id].m != null && !(full[id].l != null && full[id].l <= full[id].m)).sort((a, b) => full[a].m - full[b].m);
  const G = { PV1: ids.filter((i) => P[i].kind === 'ext' || P[i].kind === 'int'), TR: ids.filter((i) => P[i].kind === 'TR'), PV2: ids.filter((i) => P[i].kind === 'PV2') };
  const BB = V.BB; let PV1D = 0, row2X = BB.min.x + 1;
  Object.values(P).forEach((p) => { p.pile = null; });
  for (const [g, list] of Object.entries(G)) {
    const step = Math.max(...list.map((i) => P[i].sy), 3) + 0.9, MAXN = g === 'PV1' ? 14 : 20;
    let pile = 0, n = 0, h = 0, gx = row2X, wcur = 0;
    for (const id of list) {
      const p = P[id], qy = new THREE.Quaternion();
      if ((g === 'PV1') !== p.thinX) qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      const q = g === 'TR' ? new THREE.Quaternion() : qy.clone().multiply(p.lie.q), b = boxAt(p.solid.geometry, q);
      if (n >= MAXN) { pile++; n = 0; h = 0; if (g !== 'PV1') { gx += wcur + 1.2; wcur = 0; } }
      let cx, cz;
      if (g === 'PV1') { cx = BB.min.x + 2.5 + pile * step; cz = BB.min.z - 2.5 - (b.max.z - b.min.z) / 2; PV1D = Math.max(PV1D, b.max.z - b.min.z); }
      else { const wz = b.max.z - b.min.z, wx = b.max.x - b.min.x; wcur = Math.max(wcur, wx); cx = gx + wx / 2; cz = BB.min.z - 2.5 - PV1D - 1.5 - wz / 2; row2X = gx + wcur + 1.2; }
      p.pile = { q, p: new THREE.Vector3(cx - (b.min.x + b.max.x) / 2, BB.min.y + h - b.min.y + 0.02, cz - (b.min.z + b.max.z) / 2) };
      h += (b.max.y - b.min.y) + 0.03; n++;
    }
  }
  const totKg = L.reduce((a, p) => a + p.kg, 0);
  const ev = L.filter((p) => full[p.code].m != null).map((p) => ({ t: full[p.code].m + 0.3, kg: p.kg, g: p.grupo })).sort((a, b) => a.t - b.t);
  const lifts = Object.values(full).filter((x) => x.v != null).map((x) => x.v + 0.5);
  const montKg = L.filter((p) => p.montado).reduce((a, p) => a + p.kg, 0);
  const algumLev = L.some((p) => p.lev);
  return { L, by, full, dias, jan, totKg, ev, lifts, montKg, nd, dk, algumLev };
}

function pose3D(t, S){
  const P = V.panels, ghostOp = t < 1.9 ? 0.85 : t < 3.1 ? 0.85 - 0.43 * ((t - 1.9) / 1.2) : 0.42;
  for (const [id, p] of Object.entries(P)) {
    p.ghost.material.opacity = ghostOp * (GOP[p.kind] ?? 0.5);
    const s = S.full[id];
    if (!s || s.m == null || t < s.m) { p.solid.visible = false; p.ghost.visible = true; continue; }
    const WALL = p.kind === 'ext' || p.kind === 'int' || p.kind === 'PV2', ROOF = p.kind === 'TR';
    const direct = s.l != null && s.l <= s.m;
    const st = ROOF ? (p.pile || p.stand) : !WALL ? p.stand : direct ? p.lie : (p.pile || p.lie);
    let q = st.q.clone(), pos = st.p.clone(), flash = Math.max(0, 1 - (t - s.m) / 0.7);
    pos.y += (1 - ease((t - s.m) / 0.45)) * 2.2;
    if (!ROOF && !direct && s.l != null && t >= s.l && p.pile) { const k = eio((t - s.l) / 1.0); q = p.pile.q.clone().slerp(p.lie.q, k); pos = p.pile.p.clone().lerp(p.lie.p, k); pos.y += Math.sin(Math.PI * k) * 4; flash = Math.max(flash, 0.6 * Math.max(0, 1 - (t - s.l) / 0.8)); }
    let up = 0;
    if (ROOF && s.v != null && t >= s.v && p.pile) { const k = eio((t - s.v) / 1.0); q = p.pile.q.clone().slerp(p.stand.q, k); pos = p.pile.p.clone().lerp(p.stand.p, k); pos.y += Math.sin(Math.PI * k) * 3; up = k; flash = Math.max(flash, Math.max(0, 1 - (t - s.v) / 0.9)); }
    if (WALL && s.v != null && t >= s.v) { up = eio((t - s.v) / 1.0); q = p.lie.q.clone().slerp(p.stand.q, up); pos = p.lie.p.clone().lerp(p.stand.p, up); flash = Math.max(flash, Math.max(0, 1 - (t - s.v) / 0.9)); }
    p.solid.visible = true; p.solid.quaternion.copy(q); p.solid.position.copy(pos);
    p.ghost.visible = up < 1;
    p.solid.material.color.copy(up > 0 ? LIFT : BLUE).lerp(WHITE, flash * 0.85);
    if (up > 0) p.solid.material.emissive.setRGB(0.15 * flash + 0.04, 0.3 * flash + 0.2, 0.2 * flash + 0.1);
    else p.solid.material.emissive.setRGB(0.15 * flash + 0.06, 0.3 * flash + 0.16, 0.5 * flash + 0.36);
  }
  // câmera: órbita lenta, enquadrando prédio + pilhas
  const sz = V.BB.getSize(new THREE.Vector3()), R = Math.max(sz.x, sz.z);
  const az = -2.45 + t * 0.026, el = 0.68 - 0.14 * Math.min(1, Math.max(0, t - 1) / 15), dist = R * (2.95 - 0.18 * Math.min(1, Math.max(0, t - 1) / 15));
  const c = V.ctr.clone(); c.z -= sz.z * 0.25;
  V.cam.position.set(c.x + Math.cos(az) * Math.cos(el) * dist, V.BB.min.y + Math.sin(el) * dist + 0.5, c.z + Math.sin(az) * Math.cos(el) * dist);
  V.cam.lookAt(c.x, V.BB.min.y + 1, c.z);
  V.r.render(V.scene, V.cam);
}

function quadro(ctx, t, S){
  pose3D(t, S);
  const s = (v) => v * K;
  const mix = (a) => `rgba(245,247,252,${a})`;
  ctx.fillStyle = BGc; ctx.fillRect(0, 0, VW, VH);
  ctx.drawImage(V.r.domElement, 0, FY);
  const g1 = ctx.createLinearGradient(0, FY, 0, FY + s(140)); g1.addColorStop(0, BGc); g1.addColorStop(1, 'rgba(13,18,32,0)'); ctx.fillStyle = g1; ctx.fillRect(0, FY, VW, s(140));
  const g2 = ctx.createLinearGradient(0, FY + GH - s(140), 0, FY + GH); g2.addColorStop(0, 'rgba(13,18,32,0)'); g2.addColorStop(1, BGc); ctx.fillStyle = g2; ctx.fillRect(0, FY + GH - s(140), VW, s(140));
  const txt = (t_, x, y, font, fill, align = 'left') => { ctx.font = font; ctx.fillStyle = fill; ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillText(t_, x, y); };
  const F = (w, px, fam = 'Archivo') => `${w} ${Math.round(s(px))}px "${fam}", sans-serif`;
  const win = (a, b, f = 0.35) => Math.min(ease((t - a) / f), ease((b - t) / f));
  txt(VID.tag, s(60), s(120), F(800, 32), `rgba(78,163,255,${ease(t / 0.4)})`);
  let a = win(0, 3.6, 0.3);
  const tons = Math.round(S.totKg / 1000);
  if (a > 0) { txt(`${tons} toneladas de aço.`, s(60), s(172) + (1 - a) * s(20), F(800, 88), mix(a)); txt('Quantos dias pra montar?', s(60), s(280) + (1 - a) * s(20), F(800, 58), `rgba(243,238,42,${a})`); }
  S.jan.forEach(([d, t0, t1], k) => {
    const tend = k + 1 < S.jan.length ? S.jan[k + 1][1] : 16.0; const al = win(t0 - 0.15, tend - 0.05, 0.3); if (al <= 0) return;
    const D = S.L.filter((p) => S.dk(p.dia) === d), kgd = D.reduce((x, p) => x + p.kg, 0);
    const parts = []; [...new Set(D.map((p) => p.grupo))].forEach((gp) => { const n = D.filter((p) => p.grupo === gp).length; const nm = NOME_GRUPO(gp).replace(/ (PV\d|TR)$/, '').toLowerCase(); parts.push(`+${n} ${n === 1 ? nm.replace(/s$/, '').replace(/ões$/, 'ão') : nm}`); });
    const nlev = Object.values(S.full).filter((x) => x.v != null && x.v >= t0 - 0.01 && x.v <= t1 + 0.01).length;
    if (nlev) parts.push(`+${nlev} levantadas`);
    const lab = `DIA ${k + 1}`;
    ctx.font = F(800, 150); const lw = ctx.measureText(lab).width;
    txt(lab, s(56), s(160) + (1 - al) * s(25), F(800, 150), mix(al));
    const lines = [...parts, ...(kgd ? [`${fmt(kgd)} kg de aço`] : [])];
    lines.forEach((ln, j) => txt(ln, s(56) + lw + s(34), s(lines.length < 4 ? 196 : 178) + j * s(38) + (1 - al) * s(25), F(600, 30, 'Public Sans'), j < parts.length ? (/levantadas/.test(ln) ? `rgba(62,224,143,${al})` : `rgba(78,163,255,${al})`) : `rgba(140,152,178,${al})`));
  });
  a = ease((t - 16.0) / 0.45);
  if (a > 0) {
    txt(`${S.nd} ${S.nd === 1 ? 'dia' : 'dias'}. ${fmt1(S.montKg / 1000)} t de aço.`, s(60), s(172) + (1 - a) * s(20), F(800, 88), mix(a));
    txt(S.algumLev ? 'Paredes subindo.' : 'Próximo passo: levantar.', s(60), s(280) + (1 - a) * s(20), F(800, 58), `rgba(78,163,255,${a})`);
  }
  // legenda
  const chips = [['Montado', '#4ea3ff'], ...(S.algumLev ? [['Levantado', '#3ee08f']] : [])]; let x = s(60);
  chips.forEach(([l, c]) => { ctx.font = F(600, 30, 'Public Sans'); const tw = ctx.measureText(l).width, w = s(20 + 22 + 12 + 22) + tw;
    ctx.fillStyle = '#161e32'; ctx.strokeStyle = '#283450'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, s(372), w, s(48), s(24)); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x + s(20), s(385), s(22), s(22), s(6)); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#f5f7fc'; ctx.textAlign = 'left'; ctx.fillText(l, x + s(54), s(396)); x += w + s(14); });
  // contadores
  const done = S.ev.filter((e) => e.t <= t), kgD = done.reduce((q, e) => q + e.kg, 0), pct = S.totKg ? kgD / S.totKg : 0, y0 = s(1390);
  const tot = (g) => S.L.filter((p) => p.grupo === g).length, feito = (g) => done.filter((e) => e.g === g).length;
  [[s(60), 'PV1', 'painéis'], [s(380), 'PV2', 'treliças']].forEach(([xx, g, nm]) => { if (!tot(g)) return; txt(fmt(feito(g)), xx, y0, F(800, 76), '#f5f7fc'); txt(`de ${tot(g)} ${nm}`, xx, y0 + s(92), F(600, 30, 'Public Sans'), '#8c98b2'); });
  txt(`${Math.round(pct * 100)}%`, s(1020), y0, F(800, 76), '#4ea3ff', 'right'); txt('do aço montado', s(1020), y0 + s(92), F(600, 30, 'Public Sans'), '#8c98b2', 'right');
  const by_ = y0 + s(150);
  ctx.fillStyle = '#1e2840'; ctx.beginPath(); ctx.roundRect(s(60), by_, s(960), s(18), s(9)); ctx.fill();
  if (pct > 0.005) { ctx.fillStyle = '#4ea3ff'; ctx.beginPath(); ctx.roundRect(s(60), by_, s(960) * pct, s(18), s(9)); ctx.fill(); }
  txt(`${fmt(kgD)} de ${fmt(S.totKg)} kg de aço`, s(60), by_ + s(34), F(600, 30, 'Public Sans'), '#f5f7fc');
  const nup = S.lifts.filter((x2) => x2 <= t).length;
  if (nup) txt(`${nup} peças em pé`, s(1020), by_ + s(34), F(600, 30, 'Public Sans'), '#3ee08f', 'right');
  a = ease((t - 17.0) / 0.5);
  if (a > 0) { txt('Montagem acompanhada painel por painel', s(60), by_ + s(100), F(600, 30, 'Public Sans'), mix(a)); txt('Siga pra ver os 100%  →', s(60), by_ + s(144), F(800, 40), `rgba(240,140,40,${a})`); }
}

// escolhe o formato que este aparelho grava de verdade: MP4 primeiro (WhatsApp/iPhone), senão WebM.
// (alguns navegadores dizem que suportam MP4 e gravam um arquivo vazio: testa com 0,4 s antes)
async function escolherTipo(cv, ctx){
  const tipos = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter((m) => MediaRecorder.isTypeSupported(m));
  for (const m of tipos) {
    try {
      const st = cv.captureStream(30), r = new MediaRecorder(st, { mimeType: m }), p = []; r.ondataavailable = (e) => e.data.size && p.push(e.data);
      const fim = new Promise((ok) => { r.onstop = ok; }); r.start(100);
      const t0 = performance.now(); await new Promise((ok) => { const f = (now) => { ctx.fillStyle = (Math.floor(now / 50) % 2) ? '#0d1220' : '#111a2e'; ctx.fillRect(0, 0, 8, 8); now - t0 < 400 ? requestAnimationFrame(f) : ok(); }; requestAnimationFrame(f); });
      r.stop(); await fim; st.getTracks().forEach((k) => k.stop());
      if (p.reduce((a, b) => a + b.size, 0) > 200) return m;
    } catch {}
  }
  throw new Error('este aparelho não conseguiu gravar vídeo');
}
async function gerarVideo(){
  if (gravando) return;
  if (!C()?.paineis?.size) throw new Error('o 3D ainda não terminou de abrir');
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('este navegador não grava vídeo; use o Chrome ou o Safari atualizado');
  gravando = true; window.__campoPausa = true;
  try { return await gravarVideo(); } finally { gravando = false; window.__campoPausa = false; }
}
async function gravarVideo(){
  out('<div class="prog">Preparando o vídeo…</div>');
  await document.fonts.ready;
  if (!V) montarCena();
  const S = prepararLinha();
  const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH; cv.className = 'prev';
  const ctx = cv.getContext('2d');
  out(`<div class="prog">Gravando… deixe esta tela aberta (~${Math.round(VID.dur)} s)<div class="bar"><i id="rel-bar"></i></div></div>`);
  $('rel-out').prepend(cv);
  const tipo = await escolherTipo(cv, ctx);
  // quadro a quadro: cada imagem é desenhada e entregue ao gravador; em aparelho lento o vídeo sai inteiro (só demora mais)
  const stream = cv.captureStream(0), trilha = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: tipo, videoBitsPerSecond: 6e6 });
  const partes = []; rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
  const fim = new Promise((ok) => { rec.onstop = ok; });
  rec.start(500);
  const N = Math.round(VID.dur * 30); let ultimo = performance.now();
  for (let i = 0; i <= N; i++) {
    quadro(ctx, i / 30, S); trilha.requestFrame?.();
    const b = $('rel-bar'); if (b) b.style.width = (i / N * 100) + '%';
    // segura o ritmo de ~30 quadros por segundo (no máximo) para o tempo do vídeo bater com o da animação
    const espera = 1000 / 30 - (performance.now() - ultimo);
    await new Promise((ok) => setTimeout(ok, Math.max(0, espera)));
    ultimo = performance.now();
  }
  rec.stop(); await fim; stream.getTracks().forEach((k) => k.stop());
  const mime = (rec.mimeType || tipo || 'video/webm').split(';')[0];
  const blob = new Blob(partes, { type: mime });
  if (blob.size < 1000) throw new Error('a gravação saiu vazia; tente de novo com a tela ligada');
  entregar(blob, `Evolucao_producao_${hoje()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, mime, '<video controls playsinline muted></video>');
}

// para conferência (testes): desenha o quadro do segundo t num canvas e devolve a imagem
window.CAMPO_REL = { VID, async quadro(t){ await document.fonts.ready; if (!V) montarCena(); const S = window.__S || (window.__S = prepararLinha()); const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH; quadro(cv.getContext('2d'), t, S); return cv.toDataURL('image/jpeg', 0.9); }, gerarPDF, gerarVideo };

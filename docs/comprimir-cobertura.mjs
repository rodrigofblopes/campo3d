import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, join, weld, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
// uso: node comprimir-cobertura.mjs entrada.glb saida.glb tesouras|trelicas|cobertura|laje
const [,, entrada, saida, modo] = process.argv;
const doc = await io.read(entrada);
const root = doc.getRoot();
const rootNode = (root.getDefaultScene() || root.listScenes()[0]).listChildren()[0];
const pad = (n) => String(n).padStart(2, '0');

function bbox(node){
  const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
  for (const p of node.getMesh().listPrimitives()) {
    const a = p.getAttribute('POSITION'); const lo = a.getMin([]), hi = a.getMax([]);
    for (let k=0;k<3;k++){ mn[k]=Math.min(mn[k],lo[k]); mx[k]=Math.max(mx[k],hi[k]); }
  }
  return { mn: mn.map(v=>v*0.3048), mx: mx.map(v=>v*0.3048) };
}

if (modo === 'tesouras') {
  const membros = rootNode.listChildren().map((n) => ({ n, b: bbox(n) }));
  membros.forEach((m) => { m.cx = (m.b.mn[0] + m.b.mx[0]) / 2; });
  membros.sort((a, b) => a.cx - b.cx);
  const grupos = [];
  for (const m of membros) {
    const g = grupos[grupos.length - 1];
    if (g && m.cx - g.cx < 0.3) g.ms.push(m); else grupos.push({ cx: m.cx, ms: [m] });
  }
  if (grupos.length !== 24) throw new Error('esperava 24 tesouras, achei ' + grupos.length);
  const cont = { 1: 0, 2: 0, 3: 0 };
  const resumo = [];
  grupos.forEach((g) => {
    const y0 = Math.min(...g.ms.map((m) => m.b.mn[1])), y1 = Math.max(...g.ms.map((m) => m.b.mx[1]));
    const dy = y1 - y0;
    const tipo = dy > 11.5 ? 2 : dy < 8.5 ? 3 : 1;   // TS02 mais comprida, TS03 mais curta (prancha M05)
    const code = `TS0${tipo}-${pad(++cont[tipo])}`;
    const node = doc.createNode(code).setExtras({ parameters: { Marca: code, Tipo: `TS 0${tipo}`, Barras: String(g.ms.length) } });
    rootNode.addChild(node);
    g.ms.forEach(({ n }) => { rootNode.removeChild(n); n.setName(''); n.setExtras({}); n.getMesh().setName(''); node.addChild(n); });
    resumo.push(`${code} x=${g.cx.toFixed(2)} comp=${dy.toFixed(2)} barras=${g.ms.length}`);
  });
  console.log(resumo.join('\n'));
  if (cont[1] !== 18 || cont[2] !== 3 || cont[3] !== 3) throw new Error('tipos não batem com a prancha: ' + JSON.stringify(cont));
} else if (modo === 'cobertura') {
  // Painéis TR da cobertura ("3D Cobertura.glb"). As Marcas do Revit NÃO batem com a prancha M08
  // (ex.: o painel que a M08 chama de TR-2 está marcado "TR-7"; existe "TR-13" e falta "TR-3").
  // O código vem da posição: centro (x, z) em metros de cada painel na locação da M08.
  const M08 = {
    'TR-01': [3.07, -4.38], 'TR-03': [8.60, -4.38], 'TR-05': [14.46, -4.38], 'TR-09': [21.12, -5.47],
    'TR-08': [21.12, -2.00], 'TR-10': [26.86, -4.38], 'TR-12': [30.72, -4.38],
    'TR-02': [3.07, -9.86], 'TR-04': [8.60, -9.86], 'TR-06': [14.00, -9.86], 'TR-07': [18.84, -9.86], 'TR-11': [29.36, -9.86],
  };
  const usados = new Set(), resumo = [];
  rootNode.listChildren().forEach((n) => {
    const p = n.getExtras()?.parameters || {};
    if (!/^TR/i.test(p['Marca'] || '')) { rootNode.removeChild(n); return; }
    const b = getBounds(n), cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    let code = null, d0 = 1e9;
    for (const [k, [x, z]] of Object.entries(M08)) { const d = Math.hypot(cx - x, cz - z); if (d < d0) { d0 = d; code = k; } }
    if (d0 > 1 || usados.has(code)) throw new Error(`painel ${p['Marca']} em x=${cx.toFixed(2)} z=${cz.toFixed(2)} não bate com a M08`);
    usados.add(code);
    n.setName(code).setExtras({ parameters: { Marca: code, 'Marca no Revit': p['Marca'] } });
    resumo.push(`${p['Marca']} -> ${code}`);
  });
  console.log(resumo.join('\n'));
  if (usados.size !== 12) throw new Error('esperava 12 painéis TR, achei ' + usados.size);
} else if (modo === 'laje') {
  // Laje da caixa d'água (LJ1, sobre o PV1). Tira o plano da abertura e os pedaços soltos na origem.
  rootNode.listChildren().forEach((n) => {
    const p = n.getExtras()?.parameters || {};
    if ((p['Marca'] || '') !== 'LJ1') { rootNode.removeChild(n); return; }
    n.setName('LJ1-01').setExtras({ parameters: { Marca: 'LJ1-01' } });
    let fora = 0;
    for (const q of n.getMesh().listPrimitives()) {
      const a = q.getAttribute('POSITION'), lo = a.getMin([]), hi = a.getMax([]);
      const longe = Math.max(...hi.map((v, k) => Math.abs(v - lo[k]))) < 1e-6 || Math.hypot(...lo.map((v, k) => (v + hi[k]) / 2)) < 2;
      const mat = q.getMaterial();
      if (longe || (mat && mat.getAlpha() < 1)) { n.getMesh().removePrimitive(q); fora++; }
    }
    console.log('LJ1-01: tirei', fora, 'pedaços (abertura e soltos na origem)');
  });
} else {
  // treliças PV2: um nó por peça, já com Marca. Limpa os parâmetros que o app não usa.
  rootNode.listChildren().forEach((n) => {
    const p = n.getExtras()?.parameters || {};
    n.setExtras({ parameters: { Marca: p['Marca'], Volume: p['Volume'] || '' } });
  });
}
root.listMaterials().forEach((m) => m.setName(''));
await doc.transform(dedup(), join({ keepNamed: true }), weld(), prune({ keepExtras: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(saida, doc);
console.log('ok', saida, root.listMeshes().length, 'meshes', root.listMaterials().length, 'materiais');

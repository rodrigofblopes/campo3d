import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, join, weld, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
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

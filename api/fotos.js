/* Fotos dos problemas (Campo3D).
   POST /api/fotos  {obra, id, elemento, autor, em, mime, dados(base64)}  -> guarda (o mesmo id não duplica)
   GET  /api/fotos?id=...                                                  -> a imagem
   GET  /api/fotos?obra=amaggi&elemento=PV1-23                             -> lista das fotos da peça
   A foto chega já reduzida pelo celular (~200–300 KB). Fica no mesmo banco Postgres (Neon) das etapas. */
import { neon } from '@neondatabase/serverless';

const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
let pronto = null;

function db(){
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL não configurada no Vercel');
  return neon(url);
}
async function criarTabela(sql){
  if (!pronto) pronto = sql`create table if not exists foto (
      id text primary key, obra text not null, elemento text not null, autor text,
      tirada_em timestamptz not null, recebida_em timestamptz not null default now(),
      mime text not null, tamanho integer not null, dados text not null)`
    .then(() => sql`create index if not exists foto_obra_elemento on foto (obra, elemento)`)
    .catch((e) => { pronto = null; throw e; });
  return pronto;
}
const txt = (v, n) => (v == null ? null : String(v).slice(0, n));

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res){
  try {
    const sql = db();
    await criarTabela(sql);

    if (req.method === 'GET') {
      const id = txt(req.query.id, 60);
      if (id) {
        const [f] = await sql`select mime, dados from foto where id = ${id}`;
        if (!f) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ erro: 'Foto não encontrada' }); }
        res.setHeader('Content-Type', f.mime);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.status(200).send(Buffer.from(f.dados, 'base64'));
      }
      res.setHeader('Cache-Control', 'no-store');
      const obra = txt(req.query.obra, 40), elemento = txt(req.query.elemento, 40);
      if (!obra) return res.status(400).json({ erro: 'Informe o id da foto ou a obra' });
      const linhas = elemento
        ? await sql`select id, elemento, autor, tirada_em, tamanho from foto where obra = ${obra} and elemento = ${elemento} order by tirada_em`
        : await sql`select id, elemento, autor, tirada_em, tamanho from foto where obra = ${obra} order by tirada_em`;
      return res.status(200).json({ obra, fotos: linhas });
    }

    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = txt(b.id, 60), obra = txt(b.obra, 40), elemento = txt(b.elemento, 40);
      const mime = MIMES.has(b.mime) ? b.mime : 'image/jpeg';
      const dados = typeof b.dados === 'string' ? b.dados.replace(/\s/g, '') : '';
      if (!id || !obra || !elemento || !dados) return res.status(400).json({ erro: 'Foto incompleta' });
      if (dados.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(dados)) return res.status(413).json({ erro: 'Foto grande demais ou inválida' });
      const em = isNaN(Date.parse(b.em)) ? new Date().toISOString() : new Date(b.em).toISOString();
      const tamanho = Math.floor(dados.length * 3 / 4);
      await sql`insert into foto (id, obra, elemento, autor, tirada_em, mime, tamanho, dados)
        values (${id}, ${obra}, ${elemento}, ${txt(b.autor, 60) || 'Sem nome'}, ${em}, ${mime}, ${tamanho}, ${dados})
        on conflict (id) do nothing`;
      return res.status(200).json({ ok: true, id });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message });
  }
}

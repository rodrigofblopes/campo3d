/* API das etapas de execução (Campo3D).
   GET  /api/etapas?obra=l14q13          -> etapa atual de cada ponto da obra
   POST /api/etapas  {obra, marcacoes:[{elemento, etapa, autor, ambiente, em}]}
   Banco: Postgres (Neon) ligado ao projeto no Vercel, variável DATABASE_URL.
   As tabelas são criadas na primeira chamada. Última marcação vence, pela hora
   em que foi feita no celular (a fila offline pode chegar fora de ordem). */
import { neon } from '@neondatabase/serverless';

const ETAPA_MAX = 4; // 0 não iniciado · 1 infra · 2 enfiação · 3 acabamento · 4 testado
let pronto = null;

function db(){
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL não configurada no Vercel');
  return neon(url);
}

async function criarTabelas(sql){
  if (!pronto) pronto = (async () => {
    await sql`create table if not exists etapa_ponto (
      obra text not null, elemento text not null, etapa smallint not null,
      ambiente text, autor text, marcado_em timestamptz not null,
      recebido_em timestamptz not null default now(),
      primary key (obra, elemento))`;
    await sql`create table if not exists etapa_historico (
      id bigserial primary key, obra text not null, elemento text not null,
      etapa smallint not null, ambiente text, autor text,
      marcado_em timestamptz not null, recebido_em timestamptz not null default now())`;
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

const txt = (v, n) => (v == null ? null : String(v).slice(0, n));

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  try {
    const sql = db();
    await criarTabelas(sql);

    if (req.method === 'GET') {
      const obra = txt(req.query.obra, 40);
      if (!obra) return res.status(400).json({ erro: 'Informe a obra' });
      const linhas = await sql`select elemento, etapa, autor, ambiente, marcado_em
        from etapa_ponto where obra = ${obra}`;
      const pontos = {};
      linhas.forEach((l) => { pontos[l.elemento] = { etapa: l.etapa, autor: l.autor, ambiente: l.ambiente, em: l.marcado_em }; });
      return res.status(200).json({ obra, pontos, agora: new Date().toISOString() });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const obra = txt(body.obra, 40);
      const lista = Array.isArray(body.marcacoes) ? body.marcacoes.slice(0, 500) : [];
      if (!obra || !lista.length) return res.status(400).json({ erro: 'Nada para salvar' });
      let salvas = 0;
      for (const m of lista) {
        const elemento = txt(m.elemento, 40);
        const etapa = Number(m.etapa);
        if (!elemento || !Number.isInteger(etapa) || etapa < 0 || etapa > ETAPA_MAX) continue;
        const em = isNaN(Date.parse(m.em)) ? new Date().toISOString() : new Date(m.em).toISOString();
        const autor = txt(m.autor, 60) || 'Sem nome', ambiente = txt(m.ambiente, 60);
        await sql`insert into etapa_historico (obra, elemento, etapa, ambiente, autor, marcado_em)
          values (${obra}, ${elemento}, ${etapa}, ${ambiente}, ${autor}, ${em})`;
        await sql`insert into etapa_ponto (obra, elemento, etapa, ambiente, autor, marcado_em)
          values (${obra}, ${elemento}, ${etapa}, ${ambiente}, ${autor}, ${em})
          on conflict (obra, elemento) do update set
            etapa = excluded.etapa, ambiente = excluded.ambiente, autor = excluded.autor,
            marcado_em = excluded.marcado_em, recebido_em = now()
          where etapa_ponto.marcado_em <= excluded.marcado_em`;
        salvas++;
      }
      return res.status(200).json({ ok: true, salvas });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message });
  }
}

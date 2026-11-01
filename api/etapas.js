/* API das etapas de execução (Campo3D).
   GET  /api/etapas?obra=l14q13          -> etapa atual de cada ponto da obra
   GET  /api/etapas?obra=amaggi&formato=csv -> a mesma coisa em CSV, para o Excel (Dados > Da Web)
   POST /api/etapas  {obra, marcacoes:[{elemento, etapa, autor, ambiente, em, nota}]}
   Obra Amaggi (painéis LSF): 0 não iniciado · 1 montado · 2 levantado · 3 prumo ok ·
   4 esquadro ok · 5 com problema (nota = descrição do problema, fotos = ids em /api/fotos).
   Banco: Postgres (Neon) ligado ao projeto no Vercel, variável DATABASE_URL.
   As tabelas são criadas na primeira chamada. Última marcação vence, pela hora
   em que foi feita no celular (a fila offline pode chegar fora de ordem). */
import { neon } from '@neondatabase/serverless';

const ETAPA_MAX = 5;
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
    await sql`alter table etapa_ponto add column if not exists nota text`;
    await sql`alter table etapa_historico add column if not exists nota text`;
    await sql`alter table etapa_ponto add column if not exists fotos text`;
    await sql`alter table etapa_historico add column if not exists fotos text`;
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

const txt = (v, n) => (v == null ? null : String(v).slice(0, n));
const lerFotos = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

/* CSV para o Excel: uma linha por peça marcada no app.
   "Peça" = código do app (PV1-01, TS01-05, LJ1-01); "Código planilha" = como está na Paineis.xlsx
   (PV1-1, TS1-5, LJ-1), para usar no PROCX. Datas no horário de Manaus, formato aaaa-mm-dd hh:mm. */
const NOMES = ['Não iniciado', 'Montado', 'Levantado', 'Levantado', 'Conferido (esquadro, prumo e parafusos)', 'Com problema'];
function codigoPlanilha(c){
  let m = c.match(/^TS(\d+)-(\d+)$/); if (m) return `TS${+m[1]}-${+m[2]}`;
  m = c.match(/^LJ1-(\d+)$/); if (m) return `LJ-${+m[1]}`;
  m = c.match(/^([A-Z]+\d*)-(\d+)$/); return m ? `${m[1]}-${+m[2]}` : c;
}
const dataManaus = (d) => {
  if (!d) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};
const cel = (v) => { const t = v == null ? '' : String(v); return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function csvDoApp(pontos){
  const ordem = Object.keys(pontos).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const linhas = [['Peça', 'Código planilha', 'Etapa nº', 'Etapa', 'Marcado por', 'Marcado em', 'Data', 'Observação', 'Fotos']];
  for (const k of ordem) {
    const p = pontos[k], quando = dataManaus(p.em);
    linhas.push([k, codigoPlanilha(k), p.etapa, NOMES[p.etapa] || '', p.autor || '', quando, quando.slice(0, 10), p.nota || '', (p.fotos || []).length]);
  }
  return '\uFEFF' + linhas.map((l) => l.map(cel).join(',')).join('\r\n') + '\r\n';
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  try {
    const sql = db();
    await criarTabelas(sql);

    if (req.method === 'GET') {
      const obra = txt(req.query.obra, 40);
      if (!obra) return res.status(400).json({ erro: 'Informe a obra' });
      const linhas = await sql`select elemento, etapa, autor, ambiente, nota, fotos, marcado_em
        from etapa_ponto where obra = ${obra}`;
      const pontos = {};
      linhas.forEach((l) => { pontos[l.elemento] = { etapa: l.etapa, autor: l.autor, ambiente: l.ambiente, nota: l.nota, fotos: lerFotos(l.fotos), em: l.marcado_em }; });
      if (String(req.query.formato || '').toLowerCase() === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="app-${obra}.csv"`);
        return res.status(200).send(csvDoApp(pontos));
      }
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
        const autor = txt(m.autor, 60) || 'Sem nome', ambiente = txt(m.ambiente, 60), nota = txt(m.nota, 500);
        const fotos = Array.isArray(m.fotos) && m.fotos.length ? JSON.stringify(m.fotos.slice(0, 8).map((x) => txt(x, 60))) : null;
        await sql`insert into etapa_historico (obra, elemento, etapa, ambiente, autor, nota, fotos, marcado_em)
          values (${obra}, ${elemento}, ${etapa}, ${ambiente}, ${autor}, ${nota}, ${fotos}, ${em})`;
        await sql`insert into etapa_ponto (obra, elemento, etapa, ambiente, autor, nota, fotos, marcado_em)
          values (${obra}, ${elemento}, ${etapa}, ${ambiente}, ${autor}, ${nota}, ${fotos}, ${em})
          on conflict (obra, elemento) do update set
            etapa = excluded.etapa, nota = excluded.nota, fotos = excluded.fotos, ambiente = excluded.ambiente, autor = excluded.autor,
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

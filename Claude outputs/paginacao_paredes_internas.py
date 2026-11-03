# -*- coding: utf-8 -*-
# =====================================================================
#  PAGINAÇÃO DE PLACAS - PAREDES DE PLACA (PEÇAS)  |  Dynamo / Python
#  Funciona em IronPython2 (Revit 2021) e CPython3 (Revit 2022+)
#
#  Entrada IN[0]: paredes de PLACA (as paredes finas, 1 por face),
#                 vindas de um nó "Select Model Elements".
#  Saída OUT:     relatório por parede (juntas, peças, avisos).
#
#  1) Rode com EXECUTAR = False -> só calcula e mostra o relatório.
#  2) Confira, mude para EXECUTAR = True e rode de novo -> cria e divide
#     as peças.  (Ctrl+Z no Revit desfaz tudo de uma vez.)
# =====================================================================
import clr
import math
clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')
from Autodesk.Revit.DB import *
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager
from System.Collections.Generic import List

# ======================= PARÂMETROS (mm) =============================
EXECUTAR = False
MODULO = 600.0               # modulação dos montantes (400 ou 600)
PLACA_L = 1200.0             # largura da placa (em pé)
PLACA_H = 1800.0             # altura da placa
FOLGA_OMBREIRA_MIN = 200.0   # junta x ombreira / verga / peitoril: mínimo
FOLGA_OMBREIRA_IDEAL = 400.0 # ... ideal
PECA_MIN = 300.0             # menor peça aceitável
DESENC_HORIZ_MIN = 400.0     # desencontro mínimo das juntas horizontais entre colunas
DIST_FACES_MAX = 300.0       # distância máx. entre as 2 faces de placa da mesma parede
DIST_VAO_MAX = 400.0         # distância máx. porta/janela -> parede de placa
# =====================================================================

FT = 304.8
TOL = 0.5
doc = DocumentManager.Instance.CurrentDBDocument


# ---------------------------- lógica 1D ------------------------------
def grade(a, b, origem):
    k0 = int(math.floor((a - origem) / MODULO)) - 1
    k1 = int(math.ceil((b - origem) / MODULO)) + 1
    return [origem + k * MODULO for k in range(k0, k1 + 1) if a < origem + k * MODULO < b]


def escolher_juntas(a, b, origem, evitar, ombreiras):
    """Escolhe as juntas da parede inteira de uma vez (menor custo):
    1 por junta; +0,3 se a junta fica entre 200 e 400 da ombreira;
    +50 se a menos de 200; +3 se coincide com a junta da outra face;
    sobras (peças < placa) empurradas para o fim da parede."""
    L = b - a
    if L <= PLACA_L + TOL:
        return [], []
    cands = grade(a, b, origem)

    def custo_junta(c):
        k = 1.0
        for j in ombreiras:
            dj = abs(c - j)
            if dj < FOLGA_OMBREIRA_MIN - TOL:
                k += 50.0
            elif dj < FOLGA_OMBREIRA_IDEAL - TOL:
                k += 0.3
        if any(abs(c - e) <= 10.0 for e in evitar):
            k += 3.0
        return k

    def custo_peca(p, q):
        if q - p >= PLACA_L - TOL:
            return 0.0
        return 0.001 + 0.01 * (b - p) / L

    def valida(p, q):
        return PECA_MIN - TOL <= q - p <= PLACA_L + TOL

    melhor = {a: (0.0, None)}
    for c in cands:
        opcoes = [(melhor[p][0] + custo_junta(c) + custo_peca(p, c), p)
                  for p in melhor if valida(p, c)]
        if opcoes:
            melhor[c] = min(opcoes, key=lambda x: x[0])
    fim = [(melhor[p][0] + custo_peca(p, b), p) for p in melhor if valida(p, b)]
    if not fim:
        # sem solução na modulação: corta a cada placa e avisa
        js = []
        pos = a
        while b - pos > PLACA_L + TOL:
            pos += PLACA_L
            js.append(pos)
        return js, [u"sem solução na modulação - juntas a cada {:.0f} SEM montante garantido".format(PLACA_L)]
    _, p = min(fim, key=lambda x: x[0])
    juntas = []
    while p is not None and p != a:
        juntas.append(p)
        p = melhor[p][1]
    juntas.reverse()
    avisos = []
    for c in juntas:
        if any(abs(c - j) < FOLGA_OMBREIRA_MIN - TOL for j in ombreiras):
            avisos.append(u"junta em {:.0f} a menos de {:.0f} mm de ombreira".format(c - a, FOLGA_OMBREIRA_MIN))
        if any(abs(c - e) <= 10.0 for e in evitar):
            avisos.append(u"junta em {:.0f} coincide com a da outra face".format(c - a))
    return juntas, avisos


def cortes_coluna(H, indice, cortes_ant, aberturas_z):
    if H <= PLACA_H + TOL:
        return [], None
    n = int(math.ceil(H / PLACA_H - 1e-6))
    hmin = max(PECA_MIN, H - (n - 1) * PLACA_H)
    hmax = min(PLACA_H, H - (n - 2) * PLACA_H - PECA_MIN)
    if hmin > hmax:
        hmin = hmax = H - (n - 1) * PLACA_H
    hs, h = [], hmax
    while h >= hmin - TOL:
        hs.append(h)
        h -= 50.0
    if abs(hs[-1] - hmin) > TOL:
        hs.append(hmin)
    if indice % 2 == 1:
        hs.reverse()
    for desenc, vaos in [(True, True), (True, False), (False, True), (False, False)]:
        for h in hs:
            cortes = [h + k * PLACA_H for k in range(n - 1)]
            if desenc and any(abs(c - p) < DESENC_HORIZ_MIN - TOL for c in cortes for p in cortes_ant):
                continue
            if vaos and any(abs(c - z) < FOLGA_OMBREIRA_MIN - TOL for c in cortes for z in aberturas_z):
                continue
            aviso = None
            if not desenc:
                aviso = u"junta horizontal alinhada com a coluna vizinha"
            elif not vaos:
                aviso = u"junta horizontal a menos de {:.0f} mm de verga/peitoril".format(FOLGA_OMBREIRA_MIN)
            return cortes, aviso
    return [hs[0]], u"sem solução boa"


# --------------------------- geometria -------------------------------
def pontos(el):
    opt = Options()
    opt.DetailLevel = ViewDetailLevel.Fine
    pts = []

    def varrer(geo):
        if geo is None:
            return
        for g in geo:
            if isinstance(g, Solid):
                if g.Volume > 0:
                    for e in g.Edges:
                        c = e.AsCurve()
                        pts.append(c.GetEndPoint(0))
                        pts.append(c.GetEndPoint(1))
            elif isinstance(g, GeometryInstance):
                varrer(g.GetInstanceGeometry())
    varrer(el.get_Geometry(opt))
    return pts


class Eixo(object):
    """Sistema de coordenadas ao longo da parede (mm)."""
    def __init__(self, wall):
        lc = wall.Location.Curve
        self.p0 = lc.GetEndPoint(0)
        p1 = lc.GetEndPoint(1)
        v = XYZ(p1.X - self.p0.X, p1.Y - self.p0.Y, 0)
        self.d = v.Normalize()
        self.n = wall.Orientation

    def t(self, p):
        return ((p.X - self.p0.X) * self.d.X + (p.Y - self.p0.Y) * self.d.Y) * FT

    def perp(self, p):
        vx, vy = p.X - self.p0.X, p.Y - self.p0.Y
        return abs(vx * self.d.Y - vy * self.d.X) * FT

    def ponto(self, t, z_ft):
        return XYZ(self.p0.X + self.d.X * t / FT, self.p0.Y + self.d.Y * t / FT, z_ft)

    def mundo(self, t):
        return self.ponto(t, self.p0.Z)


def faixa(el, eixo):
    pts = pontos(el)
    if not pts:
        return None
    ts = [eixo.t(p) for p in pts]
    zs = [p.Z for p in pts]
    return min(ts), max(ts), min(zs), max(zs)


def param_mm(el, bips):
    for bip in bips:
        for alvo in (el, getattr(el, 'Symbol', None)):
            if alvo is None:
                continue
            p = alvo.get_Parameter(bip)
            if p is not None and p.HasValue and p.AsDouble() > 0:
                return p.AsDouble() * FT
    return None


def todas_aberturas():
    lst = []
    cats = List[BuiltInCategory]([BuiltInCategory.OST_Doors, BuiltInCategory.OST_Windows])
    for fi in FilteredElementCollector(doc).WherePasses(ElementMulticategoryFilter(cats)).WhereElementIsNotElementType():
        bb = fi.get_BoundingBox(None)
        if bb is None:
            continue
        loc = getattr(fi.Location, 'Point', None)
        larg = param_mm(fi, [BuiltInParameter.FAMILY_ROUGH_WIDTH_PARAM, BuiltInParameter.DOOR_WIDTH,
                             BuiltInParameter.WINDOW_WIDTH, BuiltInParameter.FAMILY_WIDTH_PARAM])
        lst.append((fi, bb, loc, larg))
    for op in FilteredElementCollector(doc).OfClass(Opening):
        bb = op.get_BoundingBox(None)
        if bb is not None:
            lst.append((op, bb, None, None))
    return lst


def aberturas_da_parede(eixo, a, b, abs_lst):
    res = []  # (t0, t1, z0_ft, z1_ft)
    for el, bb, loc, larg in abs_lst:
        cen = loc if loc is not None else XYZ((bb.Min.X + bb.Max.X) / 2.0,
                                              (bb.Min.Y + bb.Max.Y) / 2.0,
                                              (bb.Min.Z + bb.Max.Z) / 2.0)
        if eixo.perp(cen) > DIST_VAO_MAX:
            continue
        if loc is not None and larg:
            tc = eixo.t(loc)
            t0, t1 = tc - larg / 2.0, tc + larg / 2.0
        else:
            cs = [XYZ(x, y, 0) for x in (bb.Min.X, bb.Max.X) for y in (bb.Min.Y, bb.Max.Y)]
            ts = [eixo.t(c) for c in cs]
            t0, t1 = min(ts), max(ts)
        if t1 < a or t0 > b:
            continue
        res.append((t0, t1, bb.Min.Z, bb.Max.Z))
    return res


def paralelas(e1, e2):
    return abs(e1.d.X * e2.d.Y - e1.d.Y * e2.d.X) < 0.01


# ------------------------------ main ---------------------------------
def como_lista(x):
    if x is None:
        return []
    if isinstance(x, (list, tuple)):
        r = []
        for i in x:
            r.extend(como_lista(i))
        return r
    return [x]


paredes = [w for w in [UnwrapElement(x) for x in como_lista(IN[0])]
           if isinstance(w, Wall) and isinstance(w.Location.Curve, Line)]

dados = []
for w in paredes:
    ex = Eixo(w)
    f = faixa(w, ex)
    if f:
        dados.append({'w': w, 'e': ex, 'a': f[0], 'b': f[1], 'zb': f[2], 'zt': f[3], 'par': None})

# pares de faces (mesmo montante)
for i, A in enumerate(dados):
    if A['par'] is not None:
        continue
    for B in dados[i + 1:]:
        if B['par'] is not None or not paralelas(A['e'], B['e']):
            continue
        meio = A['e'].mundo((A['a'] + A['b']) / 2.0)
        if B['e'].perp(meio) > DIST_FACES_MAX:
            continue
        ta = sorted([B['e'].t(A['e'].mundo(A['a'])), B['e'].t(A['e'].mundo(A['b']))])
        sobrep = min(ta[1], B['b']) - max(ta[0], B['a'])
        if sobrep > 0.5 * min(A['b'] - A['a'], B['b'] - B['a']):
            A['par'], B['par'] = B, A
            B['mestre'] = A
            break

abert = todas_aberturas()
relatorio = []
ordem = [D for D in dados if 'mestre' not in D] + [D for D in dados if 'mestre' in D]

if EXECUTAR:
    TransactionManager.Instance.EnsureInTransaction(doc)

for D in ordem:
    w, ex = D['w'], D['e']
    nome = u"{} [{}]".format(w.Name, w.Id.IntegerValue if hasattr(w.Id, 'IntegerValue') else w.Id.Value)
    try:
        if 'mestre' in D:
            M = D['mestre']
            origem = ex.t(M['e'].mundo(M['a']))
            evitar = [ex.t(M['e'].mundo(j)) for j in M.get('juntas', [])]
        else:
            origem, evitar = D['a'], []
        abs_w = aberturas_da_parede(ex, D['a'], D['b'], abert)
        ombreiras = [x for o in abs_w for x in (o[0], o[1])]
        invertida = 'mestre' in D and (ex.d.X * D['mestre']['e'].d.X + ex.d.Y * D['mestre']['e'].d.Y) < 0
        if invertida:
            # pagina a partir da mesma ponta que a face 1
            jn, avisos = escolher_juntas(-D['b'], -D['a'], -origem, [-e for e in evitar], [-o for o in ombreiras])
            juntas = sorted(-j for j in jn)
        else:
            juntas, avisos = escolher_juntas(D['a'], D['b'], origem, evitar, ombreiras)
        D['juntas'] = juntas
        lim = [D['a']] + juntas + [D['b']]
        pecas = [lim[k + 1] - lim[k] for k in range(len(lim) - 1)]

        # cortes horizontais (prévia com altura da parede)
        cortes_cols, ant = [], []
        for k in range(len(pecas)):
            c0, c1 = lim[k], lim[k + 1]
            zs = [(z - D['zb']) * FT for o in abs_w if o[1] > c0 and o[0] < c1
                  for z in (o[2], o[3]) if (z - D['zb']) * FT > 50]
            c, av = cortes_coluna((D['zt'] - D['zb']) * FT, k, ant, zs)
            if av:
                avisos.append(u"coluna {}: {}".format(k + 1, av))
            cortes_cols.append(c)
            ant = c

        if EXECUTAR:
            ids = List[ElementId]([w.Id])
            if not PartUtils.HasAssociatedParts(doc, w.Id):
                if not PartUtils.AreElementsValidForCreateParts(doc, ids):
                    raise Exception(u"parede não aceita peças")
                PartUtils.CreateParts(doc, ids)
                doc.Regenerate()
            nlay = w.WallType.GetCompoundStructure().LayerCount
            folhas = list(PartUtils.GetAssociatedParts(doc, w.Id, False, True))
            if len(folhas) > nlay:
                raise Exception(u"já está dividida - exclua as peças para refazer")
            plano = SketchPlane.Create(doc, Plane.CreateByNormalAndOrigin(ex.n, ex.p0))
            zb, zt = D['zb'] - 1.0, D['zt'] + 1.0
            if juntas:
                curvas = List[Curve]()
                for j in juntas:
                    curvas.Add(Line.CreateBound(ex.ponto(j, zb), ex.ponto(j, zt)))
                PartUtils.DivideParts(doc, List[ElementId](folhas), List[ElementId](), curvas, plano.Id)
                doc.Regenerate()
            # agrupa peças por coluna e corta na horizontal
            folhas = list(PartUtils.GetAssociatedParts(doc, w.Id, False, True))
            cols = {}
            for pid in folhas:
                p = doc.GetElement(pid)
                fp = faixa(p, ex)
                if not fp:
                    continue
                tc = (fp[0] + fp[1]) / 2.0
                k = sum(1 for j in juntas if j < tc)
                cols.setdefault(k, []).append((pid, fp))
            ant = []
            for k in sorted(cols.keys()):
                fp0 = cols[k][0][1]
                zs = [(z - fp0[2]) * FT for o in abs_w if o[1] > fp0[0] and o[0] < fp0[1]
                      for z in (o[2], o[3]) if (z - fp0[2]) * FT > 50]
                c, _ = cortes_coluna((fp0[3] - fp0[2]) * FT, k, ant, zs)
                ant = c
                cortes_cols[k] = c
                if not c:
                    continue
                curvas = List[Curve]()
                for h in c:
                    z = fp0[2] + h / FT
                    curvas.Add(Line.CreateBound(ex.ponto(fp0[0] - 100, z), ex.ponto(fp0[1] + 100, z)))
                PartUtils.DivideParts(doc, List[ElementId]([x[0] for x in cols[k]]),
                                      List[ElementId](), curvas, plano.Id)
            doc.Regenerate()

        face = u"face 2 (desencontrada)" if 'mestre' in D else (u"face 1" if D['par'] else u"face única")
        relatorio.append(u"{} | {} | comp. {:.0f} mm".format(nome, face, D['b'] - D['a']))
        relatorio.append(u"   juntas (do início da placa): " + u", ".join(u"{:.0f}".format(j - D['a']) for j in juntas))
        relatorio.append(u"   peças: " + u", ".join(u"{:.0f}".format(p) for p in pecas))
        relatorio.append(u"   cortes horiz. por coluna: " + u" | ".join(
            u"/".join(u"{:.0f}".format(h) for h in c) if c else u"-" for c in cortes_cols))
        for a_ in avisos:
            relatorio.append(u"   ! " + a_)
    except Exception as ex_:
        relatorio.append(u"{} | ERRO: {}".format(nome, ex_))

if EXECUTAR:
    TransactionManager.Instance.TransactionTaskDone()

relatorio.insert(0, u"{} paredes | {} | módulo {:.0f} | placa {:.0f}x{:.0f}".format(
    len(dados), u"EXECUTADO" if EXECUTAR else u"PRÉVIA (EXECUTAR = False)", MODULO, PLACA_L, PLACA_H))
OUT = relatorio

"""Controle de Vencimento: páginas, regras de status e API.

Para rodar:  uvicorn main:app --reload
"""
from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from models import Categoria, Lote, Produto, criar_tabelas, get_db
from schemas import (AlertaOut, CategoriaOut, FaixasIn, LoteIn, LoteUpdate,
                     ProdutoIn, ProdutoOut, Resumo, Status)

# =========================================================== CONFIGURAÇÕES
BASE_DIR = Path(__file__).resolve().parent

# Páginas do sistema: (endereço, nome da categoria no banco).
# Os nomes precisam ser iguais aos de CATEGORIAS_PADRAO em models.py.
# As faixas de dias de cada status ficam no banco e são editadas na tela.
PAGINAS = [
    ("alimenticios", "Alimentícios"),
    ("padaria", "Padaria"),
    ("limpeza", "Limpeza"),
]

# Cartões do topo, na ordem de exibição.
# "chave" = campo do Resumo; "cor" = classe CSS (cor-<cor>) do cartão.
CONTADORES = [
    {"status": Status.LONGE.value,        "chave": "longe",        "cor": "longe"},
    {"status": Status.ORGANIZAR.value,    "chave": "organizar",    "cor": "organizar"},
    {"status": Status.A_VENCER.value,     "chave": "a_vencer",     "cor": "avencer"},
    {"status": Status.EM_RISCO.value,     "chave": "em_risco",     "cor": "risco"},
    {"status": Status.VENCIDO.value,      "chave": "vencido",      "cor": "vencido"},
    {"status": Status.SEM_VALIDADE.value, "chave": "sem_validade", "cor": "semval"},
]
CHAVE_DO_STATUS = {c["status"]: c["chave"] for c in CONTADORES}

# Opções do filtro de status: valor + classe CSS da etiqueta colorida
OPCOES_STATUS = [
    {"valor": s.value, "classe": "s-" + s.value.replace("À", "A").replace(" ", "_")}
    for s in Status
]

# ================================================================== APP
criar_tabelas()

class StaticSemCache(StaticFiles):
    """Arquivos de static/ que o navegador sempre confere se mudaram.
    Evita a tela quebrada por CSS/JS antigos guardados no cache."""
    async def get_response(self, path, scope):
        resposta = await super().get_response(path, scope)
        resposta.headers["Cache-Control"] = "no-cache"
        return resposta


app = FastAPI(title="Controle de Vencimento")
app.mount("/static", StaticSemCache(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# Número que muda quando qualquer arquivo de static/ muda. Vai na URL (?v=...) dos
# templates e obriga o navegador a baixar de novo o CSS/JS depois de uma atualização.
templates.env.globals["versao"] = int(max(
    f.stat().st_mtime for f in (BASE_DIR / "static").rglob("*") if f.is_file()
))


# ======================================================== REGRAS DE STATUS
def dias_restantes(validade: date | None, hoje: date) -> int | None:
    """Coluna DIAS RESTANTES. Sem validade não há contagem (None)."""
    return None if validade is None else (validade - hoje).days


def calcular_status(dias: int | None, categoria: Categoria) -> Status:
    """Coluna STATUS, a partir dos dias restantes e das faixas da categoria."""
    if dias is None:
        return Status.SEM_VALIDADE
    if dias < 0:
        return Status.VENCIDO
    if dias <= categoria.dias_em_risco:
        return Status.EM_RISCO
    if dias <= categoria.dias_a_vencer:
        return Status.A_VENCER
    if dias <= categoria.dias_organizar:
        return Status.ORGANIZAR
    return Status.LONGE


def lote_para_alerta(lote: Lote, hoje: date | None = None) -> AlertaOut:
    """Transforma um lote numa linha da tabela (produto + dias + status)."""
    hoje = hoje or date.today()
    p = lote.produto
    dias = dias_restantes(lote.validade, hoje)
    return AlertaOut(
        id=lote.id, produto_id=p.id, categoria=p.categoria.nome, setor=p.setor,
        codigo=p.codigo, descricao=p.descricao, proximo_lote=lote.proximo_lote,
        quantidade=lote.quantidade, validade=lote.validade,
        dias_restantes=dias, status=calcular_status(dias, p.categoria),
    )


def buscar_lotes(db: Session, categoria: str | None, setores: list[int] | None,
                 busca: str | None) -> list[Lote]:
    """Lotes filtrados: do que vence primeiro ao último; sem validade por último."""
    q = (
        select(Lote)
        .join(Produto).join(Categoria)
        .options(joinedload(Lote.produto).joinedload(Produto.categoria))
        .order_by(Lote.validade.is_(None), Lote.validade, Produto.descricao)
    )
    if categoria:
        q = q.where(Categoria.nome.ilike(categoria))
    if setores:
        q = q.where(Produto.setor.in_(setores))
    if busca:
        q = q.where(Produto.descricao.ilike(f"%{busca}%"))
    return list(db.scalars(q).all())


# ============================================================== PÁGINAS
@app.get("/", include_in_schema=False)
def raiz():
    """A página inicial é a primeira aba."""
    return RedirectResponse(f"/{PAGINAS[0][0]}")


def registrar_pagina(slug: str, nome: str):
    """Cria a rota /<slug> que mostra templates/<slug>.html."""
    def pagina(request: Request):
        return templates.TemplateResponse(request, f"{slug}.html", {
            "hoje": date.today(),
            "nome": nome,
            "contadores": CONTADORES,
            "statuses": OPCOES_STATUS,
            "paginas": [{"slug": s, "nome": n} for s, n in PAGINAS],
            "pagina": slug,
        })
    app.add_api_route(f"/{slug}", pagina, response_class=HTMLResponse, include_in_schema=False)


for _slug, _nome in PAGINAS:
    registrar_pagina(_slug, _nome)


# ======================================================== API: CATEGORIAS
@app.get("/categorias", response_model=list[CategoriaOut], tags=["categorias"])
def listar_categorias(db: Session = Depends(get_db)):
    return db.scalars(select(Categoria).order_by(Categoria.nome)).all()


@app.put("/categorias/{categoria_id}/faixas", response_model=CategoriaOut, tags=["categorias"])
def salvar_faixas(categoria_id: int, dados: FaixasIn, db: Session = Depends(get_db)):
    """"Editar tabela": define os dias de cada status desta categoria."""
    categoria = db.get(Categoria, categoria_id)
    if not categoria:
        raise HTTPException(404, "Categoria não encontrada")
    categoria.dias_em_risco = dados.dias_em_risco
    categoria.dias_a_vencer = dados.dias_a_vencer
    categoria.dias_organizar = dados.dias_organizar
    db.commit()
    return categoria


# ========================================================= API: PRODUTOS
@app.get("/produtos", response_model=list[ProdutoOut], tags=["produtos"])
def listar_produtos(busca: str | None = None, categoria_id: int | None = None,
                    db: Session = Depends(get_db)):
    q = select(Produto).order_by(Produto.descricao)
    if busca:
        q = q.where(Produto.descricao.ilike(f"%{busca}%"))
    if categoria_id:
        q = q.where(Produto.categoria_id == categoria_id)
    return db.scalars(q).all()


@app.post("/produtos", response_model=ProdutoOut, status_code=201, tags=["produtos"])
def criar_produto(dados: ProdutoIn, db: Session = Depends(get_db)):
    if not db.get(Categoria, dados.categoria_id):
        raise HTTPException(404, "Categoria não encontrada")
    produto = Produto(**dados.model_dump())
    db.add(produto)
    db.commit()
    return produto


# ========================================================== API: LOTES
@app.post("/lotes", response_model=AlertaOut, status_code=201, tags=["lotes"])
def criar_lote(dados: LoteIn, db: Session = Depends(get_db)):
    if not db.get(Produto, dados.produto_id):
        raise HTTPException(404, "Produto não encontrado")
    lote = Lote(**dados.model_dump())
    db.add(lote)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Já existe lote deste produto com essa validade")
    return lote_para_alerta(lote)


@app.patch("/lotes/{lote_id}", response_model=AlertaOut, tags=["lotes"])
def atualizar_lote(lote_id: int, dados: LoteUpdate, db: Session = Depends(get_db)):
    lote = db.get(Lote, lote_id)
    if not lote:
        raise HTTPException(404, "Lote não encontrado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(lote, campo, valor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Já existe lote deste produto com essa validade")
    return lote_para_alerta(lote)


@app.delete("/lotes/{lote_id}", status_code=204, tags=["lotes"])
def remover_lote(lote_id: int, db: Session = Depends(get_db)):
    lote = db.get(Lote, lote_id)
    if not lote:
        raise HTTPException(404, "Lote não encontrado")
    db.delete(lote)
    db.commit()


# ======================================================== API: ALERTAS
@app.get("/alertas", response_model=list[AlertaOut], tags=["alertas"])
def alertas(categoria: str | None = None,
            setor: list[int] | None = Query(None),
            status: list[Status] | None = Query(None),
            busca: str | None = None,
            db: Session = Depends(get_db)):
    """Linhas da tabela, ordenadas por validade.
    `setor` e `status` aceitam vários valores: /alertas?setor=1&setor=2&status=EM RISCO"""
    hoje = date.today()
    itens = [lote_para_alerta(l, hoje) for l in buscar_lotes(db, categoria, setor, busca)]
    if status:
        itens = [i for i in itens if i.status in status]
    return itens


@app.get("/resumo", response_model=Resumo, tags=["alertas"])
def resumo(categoria: str | None = None, db: Session = Depends(get_db)):
    """Cartões do topo: quantos lotes em cada status."""
    hoje = date.today()
    r = Resumo(data=hoje)
    for lote in buscar_lotes(db, categoria, None, None):
        dias = dias_restantes(lote.validade, hoje)
        chave = CHAVE_DO_STATUS[calcular_status(dias, lote.produto.categoria).value]
        setattr(r, chave, getattr(r, chave) + 1)
    return r

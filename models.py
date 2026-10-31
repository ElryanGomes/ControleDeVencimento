"""Banco de dados: conexão (SQLAlchemy) e tabelas.

Planilha -> banco:
  - cada aba da planilha  -> Categoria (guarda também as faixas de dias de cada status)
  - SETOR, CÓDIGO, DESCRIÇÃO -> Produto
  - PRÓX. LOTE, QUANTIDADE, VALIDADE -> Lote (um produto pode ter vários)
DIAS RESTANTES e STATUS não ficam no banco: são calculados em main.py.
"""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from sqlalchemy import (Date, ForeignKey, Integer, String, UniqueConstraint,
                        create_engine, inspect, select)
from sqlalchemy.orm import (DeclarativeBase, Mapped, mapped_column, relationship,
                            sessionmaker)

# ---------------------------------------------------------------- conexão
BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'vencimentos.db'}")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependência do FastAPI: abre uma sessão por requisição e fecha no fim."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----------------------------------------------------------------- tabelas
class Categoria(Base):
    """Uma aba da planilha: Alimentícios, Padaria, Limpeza.

    As faixas são os limites de dias restantes (inclusive) de cada status e
    podem ser editadas na tela ("Editar tabela"):
      0 .. dias_em_risco                    -> EM RISCO
      dias_em_risco+1 .. dias_a_vencer      -> À VENCER
      dias_a_vencer+1 .. dias_organizar     -> ORGANIZAR
      acima de dias_organizar               -> LONGE
      abaixo de 0                           -> VENCIDO
    """
    __tablename__ = "categorias"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), unique=True)
    dias_em_risco: Mapped[int] = mapped_column(Integer, default=10)
    dias_a_vencer: Mapped[int] = mapped_column(Integer, default=20)
    dias_organizar: Mapped[int] = mapped_column(Integer, default=45)

    produtos: Mapped[list[Produto]] = relationship(back_populates="categoria")


class Produto(Base):
    """Colunas SETOR, CÓDIGO (de barras) e DESCRIÇÃO da planilha."""
    __tablename__ = "produtos"

    id: Mapped[int] = mapped_column(primary_key=True)
    categoria_id: Mapped[int] = mapped_column(ForeignKey("categorias.id"), index=True)
    setor: Mapped[int | None] = mapped_column(Integer)
    codigo: Mapped[str | None] = mapped_column(String(40), index=True)
    descricao: Mapped[str] = mapped_column(String(200), index=True)

    categoria: Mapped[Categoria] = relationship(back_populates="produtos")
    lotes: Mapped[list[Lote]] = relationship(
        back_populates="produto", cascade="all, delete-orphan"
    )


class Lote(Base):
    """Colunas PRÓX. LOTE, QUANTIDADE e VALIDADE da planilha.

    A validade pode ficar vazia: é o produto sem estoque, que continua
    cadastrado para não precisar ser cadastrado de novo.
    """
    __tablename__ = "lotes"
    __table_args__ = (UniqueConstraint("produto_id", "validade", name="uq_produto_validade"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"), index=True)
    validade: Mapped[date | None] = mapped_column(Date, index=True)
    quantidade: Mapped[int | None] = mapped_column(Integer)
    proximo_lote: Mapped[date | None] = mapped_column(Date)

    produto: Mapped[Produto] = relationship(back_populates="lotes")


# ------------------------------------------------------------ inicialização
# Categorias criadas na primeira execução, com as faixas iniciais (editáveis na tela)
CATEGORIAS_PADRAO = [
    {"nome": "Alimentícios", "dias_em_risco": 10, "dias_a_vencer": 20, "dias_organizar": 45},
    {"nome": "Padaria",      "dias_em_risco": 1,  "dias_a_vencer": 3,  "dias_organizar": 7},
    {"nome": "Limpeza",      "dias_em_risco": 30, "dias_a_vencer": 44, "dias_organizar": 90},
]


def _checar_banco_antigo() -> None:
    """Bancos criados antes das faixas por categoria não têm as colunas novas."""
    insp = inspect(engine)
    if insp.has_table("categorias"):
        colunas = {c["name"] for c in insp.get_columns("categorias")}
        if "dias_em_risco" not in colunas:
            raise RuntimeError(
                "O banco foi criado por uma versão antiga do sistema. "
                "Apague o arquivo vencimentos.db e rode `python seed.py` de novo."
            )


def criar_tabelas() -> None:
    """Cria as tabelas e garante que as categorias (abas) existam."""
    _checar_banco_antigo()
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        existentes = set(db.scalars(select(Categoria.nome)))
        for dados in CATEGORIAS_PADRAO:
            if dados["nome"] not in existentes:
                db.add(Categoria(**dados))
        db.commit()

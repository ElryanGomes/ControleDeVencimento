"""Formatos de entrada e saída da API (Pydantic) e o enum de Status."""
from datetime import date
from enum import Enum

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


# ------------------------------------------------------------------ status
class Status(str, Enum):
    VENCIDO = "VENCIDO"
    EM_RISCO = "EM RISCO"
    A_VENCER = "À VENCER"
    ORGANIZAR = "ORGANIZAR"
    LONGE = "LONGE"
    SEM_VALIDADE = "SEM VALIDADE"   # produto cadastrado, mas sem estoque/validade


# -------------------------------------------------------------- categorias
class CategoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nome: str
    dias_em_risco: int
    dias_a_vencer: int
    dias_organizar: int


class FaixasIn(BaseModel):
    """Limites de dias de cada status ("Editar tabela")."""
    dias_em_risco: int
    dias_a_vencer: int
    dias_organizar: int

    @model_validator(mode="after")
    def faixas_crescentes(self):
        if not (0 <= self.dias_em_risco < self.dias_a_vencer < self.dias_organizar):
            raise ValueError(
                "Os dias precisam ser crescentes: em risco < à vencer < organizar (e não negativos)"
            )
        return self


# ---------------------------------------------------------------- produtos
class ProdutoIn(BaseModel):
    """Ao cadastrar um produto, só a descrição e o setor são obrigatórios."""
    categoria_id: int
    setor: int
    codigo: str | None = None          # código de barras (opcional)
    descricao: str

    @field_validator("descricao")
    @classmethod
    def descricao_nao_vazia(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Informe a descrição")
        return v

    @field_validator("codigo")
    @classmethod
    def limpar_codigo(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class ProdutoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    categoria_id: int
    setor: int | None
    codigo: str | None
    descricao: str


# ------------------------------------------------------------------- lotes
class LoteIn(BaseModel):
    produto_id: int
    validade: date | None = None      # vazio = sem estoque / sem validade
    quantidade: int | None = None
    proximo_lote: date | None = None


class LoteUpdate(BaseModel):
    """Todos os campos opcionais: só o que for enviado é alterado.
    Enviar validade = null limpa a validade (produto sem estoque)."""
    validade: date | None = None
    quantidade: int | None = None
    proximo_lote: date | None = None


# ------------------------------------------------------------ tela principal
class AlertaOut(BaseModel):
    """Uma linha da tabela, já com DIAS RESTANTES e STATUS calculados."""
    id: int
    produto_id: int
    categoria: str
    setor: int | None
    codigo: str | None
    descricao: str
    proximo_lote: date | None
    quantidade: int | None
    validade: date | None
    dias_restantes: int | None
    status: Status


class Resumo(BaseModel):
    """Os cartões do topo: quantos lotes em cada status."""
    data: date
    longe: int = 0
    organizar: int = 0
    a_vencer: int = 0
    em_risco: int = 0
    vencido: int = 0
    sem_validade: int = 0

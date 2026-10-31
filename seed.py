"""Popula o banco com itens de exemplo nas três categorias.

As validades são relativas a hoje, para aparecerem todos os status.
Uso:  python seed.py
"""
from datetime import date, timedelta

from sqlalchemy import select

from models import Categoria, Lote, Produto, SessionLocal, criar_tabelas

# categoria -> lista de (descrição, setor, quantidade, dias até vencer ou None = sem validade)
EXEMPLOS = {
    "Alimentícios": [
        ("Salgadinhos - Tostitos - Sal Marinho - 45g", 1, 3, 6),
        ("Salgadinhos - Doritos - Pizza - 48g", 1, 10, 13),
        ("Salgadinhos - Cebolitos - 36g", 1, 12, 20),
        ("Snack - Piraquê - Pepperoni - 50g", 1, 16, 25),
        ("Batata - Lays - Sour Cream - 30g", 2, 10, 27),
        ("Haribo - Chamallows - 70g", 2, None, 61),
        ("Biscoito - Recheado Chocolate - 120g", 3, 24, -2),
        ("Amendoim - Elma Chips - Japonês - 145g", 3, 0, None),
    ],
    "Padaria": [
        ("Bolo de cenoura - fatia", 1, 8, 0),
        ("Pão de forma - Tradicional - 500g", 1, 6, 2),
        ("Croissant - Presunto e queijo", 2, 5, 6),
        ("Rosca doce", 2, 4, 20),
        ("Pão francês - pacote", 1, 0, None),
    ],
    "Limpeza": [
        ("Detergente - Neutro - 500ml", 1, 24, 25),
        ("Desinfetante - Lavanda - 2L", 1, 12, 40),
        ("Água sanitária - 1L", 2, 18, 70),
        ("Amaciante - Azul - 2L", 2, 9, 200),
        ("Esponja multiuso", 3, 40, None),
    ],
}


def main() -> None:
    criar_tabelas()
    hoje = date.today()
    with SessionLocal() as db:
        if db.scalars(select(Produto)).first():
            print("Banco já possui produtos; nada a fazer.")
            return
        for nome, itens in EXEMPLOS.items():
            categoria = db.scalars(select(Categoria).where(Categoria.nome == nome)).one()
            for descricao, setor, quantidade, dias in itens:
                validade = None if dias is None else hoje + timedelta(days=dias)
                produto = Produto(categoria_id=categoria.id, setor=setor, descricao=descricao)
                produto.lotes.append(Lote(validade=validade, quantidade=quantidade))
                db.add(produto)
        db.commit()
        print("Banco populado com os itens de exemplo.")


if __name__ == "__main__":
    main()

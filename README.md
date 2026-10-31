# Controle de Vencimento

Sistema web para controlar validade de produtos, migrado de uma planilha Excel.
Backend em **FastAPI + SQLAlchemy 2.0**, páginas em **Jinja2** e front-end em HTML/CSS/JS puro (sem build).

## Como rodar

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python seed.py                   # opcional: itens de exemplo nas 3 categorias
uvicorn main:app --reload
```

- Sistema: http://127.0.0.1:8000/ (abre em Alimentícios)
- Páginas: `/alimenticios`, `/padaria`, `/limpeza`
- Documentação da API (Swagger): http://127.0.0.1:8000/docs

O banco padrão é SQLite (`vencimentos.db`, criado na raiz). As três categorias são criadas sozinhas na primeira execução.

> **Atualizando de uma versão anterior:** o banco mudou (faixas por categoria e validade opcional).
> Apague o arquivo `vencimentos.db` e rode `python seed.py` de novo. O sistema avisa se encontrar um banco antigo.
>
> Se a tela aparecer sem estilo ou com tudo zerado depois de atualizar, o navegador está usando CSS/JS antigos do cache:
> apague a pasta antiga antes de extrair o zip novo e atualize a página com **Ctrl+F5**.
> O sistema já manda os arquivos com `?v=` e `Cache-Control: no-cache` para evitar isso.

## Como usar a tela

- **Cartões do topo:** quantidade de lotes em cada status, com a faixa de dias da categoria. Clicar num cartão filtra por aquele status.
- **Clicar numa linha:** expande as informações individuais do item (código de barras, categoria, setor, quantidade, datas e status).
- **Setores e Status:** listas com caixas de seleção; dá para marcar mais de um de cada vez.
- **⚙ Editar tabela:** define os dias de cada status **da categoria atual** (cada página tem os seus). A janela mostra como ficam os intervalos enquanto você digita.
- **⋮ (três pontinhos):** Editar, Zerar estoque ou Excluir o lote.
- **Validade vazia:** o produto aparece como `SEM VALIDADE`. Serve para item sem estoque que continua cadastrado: "Zerar estoque" faz isso em um clique, e um novo lote pode ser lançado depois.

## Estrutura

```
controle_vencimento/
├── main.py              # páginas, regras de status e API
├── models.py            # conexão com o banco e tabelas
├── schemas.py           # formatos de entrada/saída da API e enum Status
├── seed.py              # dados de exemplo
├── requirements.txt
├── README.md
├── templates/
│   ├── base.html        # layout comum: topo, filtros, tabela, menu e janelas
│   ├── nav.html         # abas de navegação
│   ├── alimenticios.html
│   ├── padaria.html
│   └── limpeza.html
└── static/
    ├── css/
    │   ├── style.css    # estilo comum
    │   ├── nav.css
    │   └── alimenticios.css  padaria.css  limpeza.css   # cor de destaque de cada página
    └── js/
        ├── comum.js     # lógica comum: API, filtros, tabela, menu, formulários
        ├── nav.js       # marca a aba ativa
        └── alimenticios.js  padaria.js  limpeza.js      # cada um chama iniciarPagina("...")
```

## Planilha → sistema

| Planilha                          | Sistema                                              |
|-----------------------------------|------------------------------------------------------|
| Abas (Alimentícios, Padaria...)   | tabela `categorias` (com as faixas de dias) + página |
| SETOR, CÓDIGO, DESCRIÇÃO          | tabela `produtos` (código = código de barras)        |
| PRÓX. LOTE, QUANTIDADE, VALIDADE  | tabela `lotes` (validade pode ser vazia)             |
| DIAS RESTANTES, STATUS            | calculados na hora (`main.py`)                       |
| Contadores do topo                | `GET /resumo`                                        |
| Tabela com filtros                | `GET /alertas`                                       |

## Regra de status

Os limites ficam **no banco, por categoria**, e são editados na tela (⚙ Editar tabela).

| Status        | Dias restantes                           | Valores iniciais (Alimentícios / Padaria / Limpeza) |
|---------------|------------------------------------------|-----------------------------------------------------|
| VENCIDO       | menor que 0                              | —                                                   |
| EM RISCO      | 0 até `dias_em_risco`                    | 10 / 1 / 30                                         |
| À VENCER      | até `dias_a_vencer`                      | 20 / 3 / 44                                         |
| ORGANIZAR     | até `dias_organizar`                     | 45 / 7 / 90                                         |
| LONGE         | acima de `dias_organizar`                | —                                                   |
| SEM VALIDADE  | validade vazia                           | —                                                   |

Os valores iniciais de Padaria e de "em risco" em Limpeza são estimativas; ajuste na tela.
Regra: `em risco < à vencer < organizar`, todos inteiros e não negativos.

## Endpoints

| Método   | Rota                          | Descrição                                                                  |
|----------|-------------------------------|----------------------------------------------------------------------------|
| GET      | `/alertas`                    | Linhas da tabela. Filtros: `categoria`, `setor` e `status` (repetíveis), `busca` |
| GET      | `/resumo`                     | Cartões do topo (`?categoria=`)                                            |
| GET      | `/categorias`                 | Lista as categorias com suas faixas                                        |
| PUT      | `/categorias/{id}/faixas`     | Salva os dias de cada status da categoria                                  |
| GET/POST | `/produtos`                   | Listar (`busca`, `categoria_id`) / criar produto                           |
| POST     | `/lotes`                      | Criar lote (validade opcional)                                             |
| PATCH    | `/lotes/{id}`                 | Editar validade, quantidade, próx. lote (`validade: null` limpa a data)    |
| DELETE   | `/lotes/{id}`                 | Excluir lote                                                               |

Exemplo de filtro múltiplo: `/alertas?categoria=Limpeza&setor=1&setor=2&status=EM RISCO&status=VENCIDO`

## Como adicionar outra categoria (nova aba)

1. Em `models.py`, acrescente a categoria (com as faixas iniciais) em `CATEGORIAS_PADRAO`.
2. Em `main.py`, acrescente `("congelados", "Congelados")` na lista `PAGINAS` (mesmo nome).
3. Copie `templates/limpeza.html`, `static/css/limpeza.css` e `static/js/limpeza.js` para `congelados.*` e troque os nomes dentro deles.

## Configuração

| Variável       | Padrão                    | Uso                               |
|----------------|---------------------------|-----------------------------------|
| `DATABASE_URL` | SQLite na raiz do projeto | Trocar de banco (ex.: PostgreSQL) |

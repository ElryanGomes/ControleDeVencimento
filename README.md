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

> **Atualizando:** esta versão **não muda o banco**; o `vencimentos.db` da versão anterior continua valendo.
> (Se vier de uma versão bem antiga, o sistema avisa e basta apagar o `vencimentos.db` e rodar `python seed.py`.)
>
> Se a tela aparecer sem estilo ou com tudo zerado depois de atualizar, o navegador está usando CSS/JS antigos do cache:
> apague a pasta antiga antes de extrair o zip novo e atualize a página com **Ctrl+F5**.
> O sistema já manda os arquivos com `?v=` e `Cache-Control: no-cache` para evitar isso.

## Como usar a tela

- **Cartões do topo:** quantidade de lotes em cada status, com a faixa de dias da categoria. Clicar num cartão filtra por aquele status.
- **Clicar numa linha:** abre o **cartão do item** flutuando na tela, com foto, código de barras, setor, quantidade, datas e status. Fecha no **×**, clicando fora do cartão ou com **Esc**. Do cartão também dá para Editar, Zerar estoque ou Excluir.
- **Foto do produto:** no cartão, **Adicionar foto / Trocar foto / Remover foto**. No celular abre a câmera ou a galeria.
- **Código de barras:** o botão de barras ao lado da busca (e no formulário de novo item) abre o leitor.
  - **Busca:** achou 1 produto, abre o cartão dele; não achou, oferece cadastrar já com o código preenchido.
  - **Novo item:** se o código já é de um produto cadastrado, descrição e setor são preenchidos e travados, e o que você lança é um **novo lote** desse produto.
- **Campos obrigatórios** ao criar: só **descrição** e **setor**. Código, validade, quantidade e próx. lote são opcionais.
- **Setores e Status:** listas com caixas de seleção; dá para marcar mais de um de cada vez.
- **⚙ Editar tabela:** define os dias de cada status **da categoria atual** (cada página tem os seus). A janela mostra como ficam os intervalos enquanto você digita.
- **⋮ (três pontinhos):** Editar, Zerar estoque ou Excluir o lote.
- **Validade vazia:** o produto aparece como `SEM VALIDADE`. Serve para item sem estoque que continua cadastrado: "Zerar estoque" faz isso em um clique, e um novo lote pode ser lançado depois.

## Leitor de código de barras

| Forma                         | Como funciona                                                                 |
|-------------------------------|-------------------------------------------------------------------------------|
| Leitor USB / Bluetooth        | Funciona sozinho: ele "digita" o código e dá Enter. Basta o cursor estar na busca ou no campo do código. |
| Câmera (Chrome/Edge, celular) | Usa o `BarcodeDetector` do navegador, sem internet.                           |
| Câmera (navegador sem isso)   | Baixa a biblioteca ZXing da internet na primeira vez (precisa de conexão).     |
| Digitar                       | A janela do leitor sempre tem uma caixa para digitar o código.                |

**A câmera só abre em endereço seguro:** `https://` ou `http://localhost`. Abrindo o sistema no celular por
`http://192.168.x.x:8000` a câmera é bloqueada pelo navegador; nesse caso use HTTPS (um proxy como Caddy ou
nginx com certificado, ou um túnel) ou um leitor USB/Bluetooth.

## Fotos dos produtos: é viável?

Sim. Com ~4.000 produtos o peso é pequeno:

- Cada foto é **reduzida no navegador para no máximo 800 px (JPEG)** antes de enviar: algo entre 30 e 100 KB.
- 4.000 fotos x 30 a 100 KB = **cerca de 120 a 400 MB** em disco. Nada de relevante para um servidor ou PC comum.
- As fotos ficam como **arquivos na pasta `fotos/`** (`fotos/<id do produto>.jpg`), **não dentro do banco**. O banco não cresce e a tabela não fica mais lenta.
- A foto só é carregada **quando o cartão abre**, então a tabela continua leve.
- Uma foto por **produto** (vale para todos os lotes dele). Limite de 2 MB por envio.
- **Backup:** copie a pasta `fotos/` junto com o `vencimentos.db`.
- Cadastrar 4.000 fotos à mão dá trabalho; o caminho natural é ir tirando a foto quando o produto passar pelo cartão. Importar imagens prontas por código de barras (catálogos públicos) é possível no futuro, mas depende de internet e de verificar a licença das imagens.

## Estrutura

```
controle_vencimento/
├── main.py              # páginas, regras de status e API
├── models.py            # conexão com o banco e tabelas
├── schemas.py           # formatos de entrada/saída da API e enum Status
├── seed.py              # dados de exemplo
├── requirements.txt
├── README.md
├── fotos/               # criada sozinha: fotos dos produtos (<id>.jpg); entra no backup
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
        ├── comum.js     # lógica comum: API, filtros, tabela, cartão, fotos, formulários
        ├── leitor.js    # leitor de código de barras (câmera / digitar)
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
| (novo) foto do produto            | arquivo `fotos/<id>.jpg`                             |

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
| GET      | `/alertas`                    | Linhas da tabela. Filtros: `categoria`, `setor` e `status` (repetíveis), `busca` (nome ou código) |
| GET      | `/resumo`                     | Cartões do topo (`?categoria=`)                                            |
| GET      | `/categorias`                 | Lista as categorias com suas faixas                                        |
| PUT      | `/categorias/{id}/faixas`     | Salva os dias de cada status da categoria                                  |
| GET/POST | `/produtos`                   | Listar (`busca` por nome ou código, `codigo` exato, `categoria_id`) / criar (só `descricao` e `setor` obrigatórios) |
| PUT      | `/produtos/{id}/foto`         | Envia a foto (corpo = JPEG, até 2 MB)                                      |
| DELETE   | `/produtos/{id}/foto`         | Remove a foto                                                              |
| GET      | `/fotos/{id}.jpg`             | A foto (arquivo estático)                                                  |
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

/* Código comum às páginas de categoria (Alimentícios, Padaria, Limpeza).
 *
 * Cada página só chama:  iniciarPagina("Nome da categoria")
 * Este arquivo cuida de: API, cartões do topo, filtros, tabela (com detalhe
 * ao clicar e menu dos 3 pontinhos), formulário de item e "Editar tabela".
 */

const $ = (id) => document.getElementById(id);

// Estado da página
const estado = {
  categoria: null,       // { id, nome, dias_em_risco, dias_a_vencer, dias_organizar }
  editando: null,        // lote em edição no formulário (null = novo item)
  itemMenu: null,        // item da linha cujo menu ⋮ está aberto
  abertas: new Set(),    // ids dos lotes com o detalhe expandido (sobrevive aos filtros)
};

const CHAVES_RESUMO = ["longe", "organizar", "a_vencer", "em_risco", "vencido", "sem_validade"];

/* ============================== UTILIDADES ============================== */

/** "2026-11-02" -> "02/11/2026" ("" se vazio) */
function fmtData(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** "EM RISCO" -> "s-EM_RISCO", "À VENCER" -> "s-A_VENCER" (classes do style.css) */
function classeStatus(status) {
  return "s-" + status.replace("À", "A").replace(/\s/g, "_");
}

/** Cria um elemento HTML: el("td", { textContent: "x" }, filhos...) */
function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  n.append(...filhos);
  return n;
}

/** Etiqueta colorida de status */
function pilula(status) {
  return el("span", { className: "status " + classeStatus(status), textContent: status });
}

/** Espera o usuário parar de digitar antes de executar */
function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const vazioParaNull = (v) => (v === "" ? null : v);
const numeroOuNull = (v) => (v === "" ? null : Number(v));

/* ================================= API ================================= */

/** fetch com tratamento de erro: lança Error com a mensagem do servidor */
async function requisicao(url, opcoes = {}) {
  const resp = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opcoes });
  if (!resp.ok) {
    let msg = `Erro ${resp.status}`;
    try {
      const corpo = await resp.json();
      if (typeof corpo.detail === "string") msg = corpo.detail;
      else if (Array.isArray(corpo.detail)) {
        msg = corpo.detail.map((d) => d.msg.replace(/^Value error, /, "")).join("; ");
      }
    } catch { /* corpo não era JSON */ }
    throw new Error(msg);
  }
  return resp.status === 204 ? null : resp.json();
}

/** { a: 1, b: [2, 3], c: "" } -> "?a=1&b=2&b=3" (ignora vazios; listas repetem a chave) */
function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else if (v !== null && v !== undefined && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? "?" + s : "";
}

const enviar = (metodo, corpo) => ({ method: metodo, body: JSON.stringify(corpo) });

const api = {
  categorias: () => requisicao("/categorias"),
  salvarFaixas: (id, dados) => requisicao(`/categorias/${id}/faixas`, enviar("PUT", dados)),
  produtos: (filtros) => requisicao("/produtos" + qs(filtros)),
  criarProduto: (dados) => requisicao("/produtos", enviar("POST", dados)),
  alertas: (filtros) => requisicao("/alertas" + qs(filtros)),
  resumo: (categoria) => requisicao("/resumo" + qs({ categoria })),
  criarLote: (dados) => requisicao("/lotes", enviar("POST", dados)),
  atualizarLote: (id, dados) => requisicao(`/lotes/${id}`, enviar("PATCH", dados)),
  removerLote: (id) => requisicao(`/lotes/${id}`, { method: "DELETE" }),
};

/* ========================== TOPO: DATA E CARTÕES ========================== */

/** Mostra a data de hoje: dia da semana em cima, data por extenso embaixo */
function mostrarData(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(a, m - 1, d);
  $("hoje-semana").textContent = data.toLocaleDateString("pt-BR", { weekday: "long" });
  $("hoje").textContent = data.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** Texto de cada cartão com a faixa de dias da categoria (muda ao editar a tabela) */
function mostrarFaixasNosCartoes() {
  const c = estado.categoria;
  const textos = {
    longe: `acima de ${c.dias_organizar} dias`,
    organizar: `${c.dias_a_vencer + 1} a ${c.dias_organizar} dias`,
    a_vencer: `${c.dias_em_risco + 1} a ${c.dias_a_vencer} dias`,
    em_risco: `0 a ${c.dias_em_risco} dias`,
    vencido: "prazo expirado",
    sem_validade: "sem estoque / sem data",
  };
  for (const k of CHAVES_RESUMO) $("f-" + k).textContent = textos[k];
}

async function carregarResumo() {
  const r = await api.resumo(estado.categoria.nome);
  mostrarData(r.data);
  for (const k of CHAVES_RESUMO) $("c-" + k).textContent = r[k];
}

/* ====================== FILTROS (listas com checkbox) ====================== */

/** Valores marcados num painel de checkbox */
function marcados(idPainel) {
  return [...$(idPainel).querySelectorAll("input:checked")].map((i) => i.value);
}

/** Atualiza o "(2)" nos botões e destaca os cartões dos status filtrados */
function atualizarIndicadores() {
  document.querySelectorAll(".multi").forEach((m) => {
    const n = m.querySelectorAll("input:checked").length;
    m.querySelector(".multi-n").textContent = n ? `(${n})` : "";
    m.querySelector(".multi-btn").classList.toggle("ativo", n > 0);
  });
  const status = marcados("painel-status");
  document.querySelectorAll(".card").forEach((c) =>
    c.classList.toggle("ativo", status.includes(c.dataset.status)));
}

/** Valores atuais dos filtros, no formato esperado por GET /alertas */
function filtrosAtuais() {
  return {
    categoria: estado.categoria.nome,
    setor: marcados("painel-setor"),
    status: marcados("painel-status"),
    busca: $("busca").value.trim(),
  };
}

/** Monta as opções de setor com os setores que existem nesta categoria */
async function carregarSetores() {
  const painel = $("painel-setor");
  const antes = new Set(marcados("painel-setor"));

  const produtos = await api.produtos({ categoria_id: estado.categoria.id });
  const setores = [...new Set(produtos.map((p) => p.setor).filter((s) => s !== null))]
    .sort((a, b) => a - b);

  if (!setores.length) {
    painel.replaceChildren(el("p", { className: "multi-vazio", textContent: "Nenhum setor cadastrado." }));
  } else {
    painel.replaceChildren(...setores.map((s) => {
      const caixa = el("input", { type: "checkbox", value: String(s), checked: antes.has(String(s)) });
      return el("label", {}, caixa, `Setor ${s}`);
    }));
  }
  atualizarIndicadores();
}

/** Abre/fecha as listas suspensas e refaz a busca quando uma caixa muda */
function ligarListasSuspensas() {
  document.querySelectorAll(".multi").forEach((multi) => {
    const painel = multi.querySelector(".multi-painel");
    multi.querySelector(".multi-btn").onclick = (ev) => {
      ev.stopPropagation();
      const abrir = painel.hidden;
      fecharListas();
      painel.hidden = !abrir;
    };
    painel.addEventListener("click", (ev) => ev.stopPropagation());
    painel.addEventListener("change", () => { atualizarIndicadores(); atualizar(); });
  });
}

function fecharListas() {
  document.querySelectorAll(".multi-painel").forEach((p) => { p.hidden = true; });
}

function limparFiltros() {
  $("busca").value = "";
  document.querySelectorAll(".multi-painel input:checked").forEach((i) => { i.checked = false; });
  atualizarIndicadores();
  atualizar();
}

/** Clicar num cartão marca/desmarca aquele status no filtro */
function alternarStatusDoCartao(status) {
  const caixa = [...$("painel-status").querySelectorAll("input")].find((i) => i.value === status);
  if (!caixa) return;
  caixa.checked = !caixa.checked;
  atualizarIndicadores();
  atualizar();
}

/* ================================= TABELA ================================= */

/** Busca os lotes (com filtros) e monta as linhas da tabela */
async function carregarLinhas() {
  const itens = await api.alertas(filtrosAtuais());

  $("total").textContent = `${itens.length} ${itens.length === 1 ? "item" : "itens"}`;
  $("vazio").hidden = itens.length > 0;

  const frag = document.createDocumentFragment();
  for (const i of itens) {
    frag.append(criarLinha(i));
    if (estado.abertas.has(i.id)) frag.append(criarDetalhe(i));
  }
  $("linhas").replaceChildren(frag);
}

/** Uma linha da tabela. Clicar nela expande o detalhe; o botão ⋮ abre o menu. */
function criarLinha(i) {
  const menu = el("button", { type: "button", className: "menu-btn", title: "Ações", textContent: "⋮" });
  menu.setAttribute("aria-label", "Ações do item");
  menu.setAttribute("aria-haspopup", "menu");
  menu.onclick = (ev) => { ev.stopPropagation(); abrirMenu(menu, i); };

  const tr = el("tr", { className: "linha" + (estado.abertas.has(i.id) ? " aberta" : ""), tabIndex: 0 },
    el("td", { className: "c", textContent: i.setor ?? "" }),
    el("td", { className: "desc" }, el("span", { className: "seta", textContent: "›" }), i.descricao),
    el("td", { className: "c", textContent: fmtData(i.proximo_lote) }),
    el("td", { className: "c", textContent: i.quantidade ?? "" }),
    el("td", { className: "c" }, i.validade ? fmtData(i.validade) : el("span", { className: "sem-valor", textContent: "—" })),
    el("td", { className: "c" }, i.dias_restantes ?? el("span", { className: "sem-valor", textContent: "—" })),
    el("td", { className: "c" }, pilula(i.status)),
    el("td", { className: "acoes-linha" }, menu),
  );
  tr.onclick = () => alternarDetalhe(tr, i);
  tr.onkeydown = (ev) => { if (ev.key === "Enter" && ev.target === tr) alternarDetalhe(tr, i); };
  return tr;
}

/** Expande ou recolhe o detalhe logo abaixo da linha */
function alternarDetalhe(tr, i) {
  const proxima = tr.nextElementSibling;
  if (proxima && proxima.classList.contains("detalhe")) {
    proxima.remove();
    tr.classList.remove("aberta");
    estado.abertas.delete(i.id);
  } else {
    tr.after(criarDetalhe(i));
    tr.classList.add("aberta");
    estado.abertas.add(i.id);
  }
}

/** Linha extra com as informações individuais do item */
function criarDetalhe(i) {
  const campo = (rotulo, valor, classe = "") =>
    el("div", { className: classe },
      el("span", { className: "dl", textContent: rotulo }),
      el("span", { className: "dv" }, valor));

  const traco = (v) => (v === null || v === undefined || v === "" ? "—" : v);

  const grade = el("div", { className: "detalhe-grid" },
    campo("Descrição", i.descricao, "largo"),
    campo("Código de barras", traco(i.codigo)),
    campo("Setor", traco(i.setor)),
    campo("Categoria", i.categoria),
    campo("Quantidade", traco(i.quantidade)),
    campo("Validade", i.validade ? fmtData(i.validade) : "Sem validade"),
    campo("Dias restantes", traco(i.dias_restantes)),
    campo("Próx. lote", traco(fmtData(i.proximo_lote))),
    campo("Status", pilula(i.status)),
  );

  return el("tr", { className: "detalhe" },
    el("td", { colSpan: 8 }, grade, el("p", { className: "detalhe-id", textContent: `Produto #${i.produto_id} · Lote #${i.id}` })));
}

/** Recarrega cartões e linhas conforme os filtros atuais */
async function atualizar() {
  try {
    await Promise.all([carregarResumo(), carregarLinhas()]);
  } catch (e) {
    alert(e.message);
  }
}

/* =========================== MENU DOS 3 PONTINHOS =========================== */

/** Abre o menu junto ao botão (vira para cima se faltar espaço embaixo) */
function abrirMenu(botao, item) {
  const menu = $("menu-linha");
  if (!menu.hidden && estado.itemMenu && estado.itemMenu.id === item.id) { fecharMenu(); return; }

  estado.itemMenu = item;
  menu.hidden = false;

  const r = botao.getBoundingClientRect();
  const largura = menu.offsetWidth;
  const altura = menu.offsetHeight;
  const esquerda = Math.max(8, Math.min(r.right - largura, window.innerWidth - largura - 8));
  let topo = r.bottom + 4;
  if (topo + altura > window.innerHeight - 8) topo = r.top - altura - 4;

  menu.style.left = `${esquerda}px`;
  menu.style.top = `${Math.max(8, topo)}px`;
}

function fecharMenu() {
  $("menu-linha").hidden = true;
  estado.itemMenu = null;
}

/** Executa a opção escolhida no menu */
function escolherAcaoDoMenu(acao) {
  const item = estado.itemMenu;
  fecharMenu();
  if (!item) return;
  if (acao === "editar") abrirModal(item);
  else if (acao === "zerar") zerarEstoque(item);
  else if (acao === "excluir") excluirLote(item);
}

/** Zera o estoque: o produto continua cadastrado, só sem quantidade e sem validade */
async function zerarEstoque(item) {
  if (!confirm(`Zerar o estoque de "${item.descricao}"?\n\nO produto continua cadastrado, sem validade, e você pode lançar um novo lote depois.`)) return;
  try {
    await api.atualizarLote(item.id, { quantidade: 0, validade: null });
    await atualizar();
  } catch (e) {
    alert(e.message);
  }
}

async function excluirLote(item) {
  const quando = item.validade ? ` com validade ${fmtData(item.validade)}` : "";
  if (!confirm(`Excluir o lote${quando}?\n\n${item.descricao}`)) return;
  try {
    await api.removerLote(item.id);
    estado.abertas.delete(item.id);
    await atualizar();
  } catch (e) {
    alert(e.message);
  }
}

/* ============================ FORMULÁRIO (MODAL) ============================ */

/** Abre o formulário: vazio para novo item, preenchido para editar um lote */
function abrirModal(lote = null) {
  estado.editando = lote;
  const form = $("form");
  form.reset();

  $("erro").hidden = true;
  $("modal-titulo").textContent = lote ? "Editar lote" : "Novo item";
  $("campos-produto").hidden = !!lote;          // ao editar, só os dados do lote
  form.elements.descricao.required = !lote;

  if (lote) {
    form.elements.validade.value = lote.validade ?? "";
    form.elements.quantidade.value = lote.quantidade ?? "";
    form.elements.proximo_lote.value = lote.proximo_lote ?? "";
  }
  $("modal").showModal();
}

/** Salva: edita o lote existente ou cria produto (se novo) + lote */
async function salvar(ev) {
  ev.preventDefault();
  const f = $("form").elements;

  const dadosLote = {
    validade: vazioParaNull(f.validade.value),      // vazio = sem estoque / sem validade
    quantidade: numeroOuNull(f.quantidade.value),
    proximo_lote: vazioParaNull(f.proximo_lote.value),
  };

  try {
    if (estado.editando) {
      await api.atualizarLote(estado.editando.id, dadosLote);
    } else {
      const produto = await obterOuCriarProduto(f);
      await api.criarLote({ produto_id: produto.id, ...dadosLote });
    }
    $("modal").close();
    await carregarSetores();
    await atualizar();
  } catch (e) {
    $("erro").textContent = e.message;   // erro aparece dentro do formulário
    $("erro").hidden = false;
  }
}

/** Reaproveita o produto se já existir com a mesma descrição nesta categoria */
async function obterOuCriarProduto(f) {
  const descricao = f.descricao.value.trim();
  const achados = await api.produtos({ busca: descricao, categoria_id: estado.categoria.id });
  const existente = achados.find((p) => p.descricao.toLowerCase() === descricao.toLowerCase());
  if (existente) return existente;

  return api.criarProduto({
    categoria_id: estado.categoria.id,
    descricao,
    setor: numeroOuNull(f.setor.value),
    codigo: f.codigo.value.trim() || null,
  });
}

/** Sugere produtos já cadastrados enquanto digita a descrição */
async function sugerirProdutos() {
  const termo = $("form").elements.descricao.value.trim();
  const lista = $("sugestoes");
  if (termo.length < 2) {
    lista.replaceChildren();
    return;
  }
  try {
    const produtos = await api.produtos({ busca: termo, categoria_id: estado.categoria.id });
    lista.replaceChildren(...produtos.slice(0, 15).map((p) => el("option", { value: p.descricao })));
  } catch { /* sugestão é opcional */ }
}

/* ============================ EDITAR TABELA (FAIXAS) ============================ */

/** Lê os três campos de dias do formulário */
function lerFaixas() {
  const f = $("form-faixas").elements;
  return {
    dias_em_risco: Number(f.em_risco.value),
    dias_a_vencer: Number(f.a_vencer.value),
    dias_organizar: Number(f.organizar.value),
  };
}

/** Devolve a mensagem de erro, ou null se as faixas forem válidas */
function validarFaixas(d) {
  const valores = [d.dias_em_risco, d.dias_a_vencer, d.dias_organizar];
  if (!valores.every(Number.isInteger)) return "Preencha os três campos com números inteiros.";
  if (!(d.dias_em_risco >= 0 && d.dias_em_risco < d.dias_a_vencer && d.dias_a_vencer < d.dias_organizar)) {
    return "Os dias precisam ser crescentes: em risco < à vencer < organizar.";
  }
  return null;
}

/** Mostra como ficam os intervalos enquanto o usuário digita */
function atualizarPreviaFaixas() {
  const d = lerFaixas();
  const erro = validarFaixas(d);
  $("erro-faixas").hidden = !erro;
  $("erro-faixas").textContent = erro || "";
  $("salvar-faixas").disabled = !!erro;

  const linhas = erro ? [] : [
    ["EM RISCO", `de 0 a ${d.dias_em_risco} dias`],
    ["À VENCER", `de ${d.dias_em_risco + 1} a ${d.dias_a_vencer} dias`],
    ["ORGANIZAR", `de ${d.dias_a_vencer + 1} a ${d.dias_organizar} dias`],
    ["LONGE", `acima de ${d.dias_organizar} dias`],
  ];
  $("faixas-previa").replaceChildren(...linhas.map(([status, texto]) =>
    el("li", {}, pilula(status), texto)));
}

function abrirFaixas() {
  const c = estado.categoria;
  const f = $("form-faixas").elements;
  $("faixas-categoria").textContent = c.nome;
  f.em_risco.value = c.dias_em_risco;
  f.a_vencer.value = c.dias_a_vencer;
  f.organizar.value = c.dias_organizar;
  atualizarPreviaFaixas();
  $("modal-faixas").showModal();
}

async function salvarFaixas(ev) {
  ev.preventDefault();
  const dados = lerFaixas();
  if (validarFaixas(dados)) return;
  try {
    estado.categoria = await api.salvarFaixas(estado.categoria.id, dados);
    $("modal-faixas").close();
    mostrarFaixasNosCartoes();
    await atualizar();
  } catch (e) {
    $("erro-faixas").textContent = e.message;
    $("erro-faixas").hidden = false;
  }
}

/* ================================== EVENTOS ================================== */

function ligarEventos() {
  // Filtros
  $("busca").addEventListener("input", debounce(atualizar));
  ligarListasSuspensas();
  $("limpar").onclick = limparFiltros;
  $("editar-tabela").onclick = abrirFaixas;
  document.querySelectorAll(".card").forEach((c) => {
    c.onclick = () => alternarStatusDoCartao(c.dataset.status);
  });

  // Menu dos 3 pontinhos
  $("menu-linha").addEventListener("click", (ev) => {
    const botao = ev.target.closest("button[data-acao]");
    if (botao) escolherAcaoDoMenu(botao.dataset.acao);
  });
  document.addEventListener("click", () => { fecharMenu(); fecharListas(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { fecharMenu(); fecharListas(); } });
  window.addEventListener("resize", fecharMenu);
  document.querySelector(".tabela-wrap").addEventListener("scroll", fecharMenu);

  // Formulário de item
  $("novo").onclick = () => abrirModal();
  $("cancelar").onclick = () => $("modal").close();
  $("form").addEventListener("submit", salvar);
  $("form").elements.descricao.addEventListener("input", debounce(sugerirProdutos, 200));

  // Editar tabela
  $("form-faixas").addEventListener("input", atualizarPreviaFaixas);
  $("form-faixas").addEventListener("submit", salvarFaixas);
  $("cancelar-faixas").onclick = () => $("modal-faixas").close();
}

/* ================================== INÍCIO ================================== */

/** Ponto de entrada de cada página: recebe o nome da categoria (igual ao do banco) */
async function iniciarPagina(nomeCategoria) {
  mostrarData($("hoje").dataset.iso);   // já mostra a data enquanto os dados carregam
  ligarEventos();
  try {
    const categorias = await api.categorias();
    estado.categoria = categorias.find((c) => c.nome === nomeCategoria);
    if (!estado.categoria) throw new Error(`Categoria "${nomeCategoria}" não encontrada no banco.`);

    mostrarFaixasNosCartoes();
    await carregarSetores();
    await atualizar();
  } catch (e) {
    alert(e.message);
  }
}

/* NAV: marca como ativa a aba da página atual.
 * Cada link do nav.html tem data-pagina="alimenticios" (ou padaria, limpeza)
 * e o endereço da página é /alimenticios, /padaria, /limpeza.
 */
const paginaAtual = location.pathname.replace(/^\/|\/$/g, "");

document.querySelectorAll("#abas .aba").forEach((aba) => {
  const ativa = aba.dataset.pagina === paginaAtual;
  aba.classList.toggle("ativa", ativa);
  if (ativa) aba.setAttribute("aria-current", "page");
});

/* Leitor de código de barras pela câmera.
 *
 * Uso (em comum.js):  const codigo = await lerCodigoDeBarras();   // texto, ou null se cancelou
 *
 * Como lê:
 *   1. BarcodeDetector, que já vem no Chrome/Edge (celular e vários computadores): rápido, sem internet.
 *   2. Se o navegador não tiver, carrega a biblioteca ZXing da internet (só nesse caso).
 *   3. Sempre dá para digitar o código na caixa da janela.
 * Leitor USB/Bluetooth não precisa disto: ele "digita" o código no campo e dá Enter.
 *
 * Atenção: a câmera só abre em endereço seguro: https:// ou http://localhost.
 */
(function () {
  const $ = (id) => document.getElementById(id);

  const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];
  const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";

  let zxingPromessa = null;

  /** Carrega a biblioteca ZXing (só quando o navegador não tem BarcodeDetector) */
  function carregarZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxingPromessa) {
      zxingPromessa = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = ZXING_URL;
        s.onload = () => resolve(window.ZXing);
        s.onerror = () => { zxingPromessa = null; reject(new Error("sem internet")); };
        document.head.append(s);
      });
    }
    return zxingPromessa;
  }

  /** Lê quadro a quadro com o BarcodeDetector do navegador */
  async function lerComDetector(video, ativo, aoLer) {
    let formatos = FORMATOS;
    if (BarcodeDetector.getSupportedFormats) {
      const aceitos = await BarcodeDetector.getSupportedFormats();
      formatos = FORMATOS.filter((f) => aceitos.includes(f));
    }
    const detector = new BarcodeDetector(formatos.length ? { formats: formatos } : undefined);
    const ciclo = async () => {
      if (!ativo()) return;
      try {
        const achados = await detector.detect(video);
        if (achados.length) { aoLer(achados[0].rawValue); return; }
      } catch { /* quadro ainda não pronto: tenta de novo */ }
      setTimeout(ciclo, 150);
    };
    ciclo();
  }

  /** Abre a janela do leitor. Resolve com o código lido/digitado, ou null ao cancelar. */
  function lerCodigoDeBarras() {
    const janela = $("modal-leitor");
    const video = $("leitor-video");
    const msg = $("leitor-msg");
    const manual = $("leitor-manual");

    return new Promise((resolve) => {
      let ativo = true;
      let stream = null;
      let zxing = null;

      const encerrar = (codigo) => {
        if (!ativo) return;
        ativo = false;
        try { if (zxing) zxing.reset(); } catch { /* já parado */ }
        if (stream) stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
        manual.value = "";
        if (janela.open) janela.close();
        resolve((codigo || "").trim() || null);
      };

      const usarManual = () => { if (manual.value.trim()) encerrar(manual.value); };

      $("leitor-cancelar").onclick = () => encerrar(null);
      $("leitor-usar").onclick = usarManual;
      manual.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); usarManual(); } };
      janela.onclose = () => encerrar(null);                               // Esc
      janela.onclick = (ev) => { if (ev.target === janela) encerrar(null); };  // clique fora

      msg.textContent = "Abrindo a câmera...";
      janela.showModal();

      (async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          msg.textContent = window.isSecureContext
            ? "Este navegador não permite usar a câmera. Digite o código abaixo ou use um leitor USB."
            : "A câmera só funciona em endereço seguro (https:// ou localhost). Digite o código abaixo ou use um leitor USB.";
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } }, audio: false,
          });
        } catch (e) {
          msg.textContent = e && e.name === "NotAllowedError"
            ? "A câmera foi bloqueada. Libere o acesso no navegador ou digite o código abaixo."
            : "Não foi possível abrir a câmera. Digite o código abaixo.";
          return;
        }
        if (!ativo) { stream.getTracks().forEach((t) => t.stop()); return; }

        video.srcObject = stream;
        try { await video.play(); } catch { /* o navegador inicia sozinho */ }
        msg.textContent = "Aponte a câmera para o código de barras.";

        if ("BarcodeDetector" in window) {
          lerComDetector(video, () => ativo, encerrar);
        } else {
          try {
            const ZX = await carregarZXing();
            if (!ativo) return;
            zxing = new ZX.BrowserMultiFormatReader();
            zxing.decodeFromVideoElement(video, (resultado) => {
              if (resultado) encerrar(resultado.getText());
            });
          } catch {
            msg.textContent = "Não foi possível carregar o leitor (sem internet?). Digite o código abaixo ou use um leitor USB.";
          }
        }
      })();
    });
  }

  window.lerCodigoDeBarras = lerCodigoDeBarras;
})();

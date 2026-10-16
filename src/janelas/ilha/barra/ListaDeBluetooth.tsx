import { useEffect, useRef, useState } from "react";
import { Bluetooth, ExternalLink, RefreshCw } from "lucide-react";
import { sistema, type AparelhoBluetooth } from "../../../ponte/ponteLocal";
import { T } from "../../../textos/textos";

const S = T.ilha.sistema;

export function ListaDeBluetooth() {
  const [aparelhos, setAparelhos] = useState<AparelhoBluetooth[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const atualizar = useRef<() => void>(() => undefined);

  useEffect(() => {
    let vivo = true;
    let lendo = false;
    const ler = async () => {
      if (lendo || !vivo) return;
      lendo = true;
      setOcupado(true);
      try {
        const lista = await sistema.bluetooth();
        if (vivo) {
          setAparelhos(lista);
          setErro(null);
        }
      } catch {
        if (vivo) setErro(S.semPonte);
      } finally {
        lendo = false;
        if (vivo) setOcupado(false);
      }
    };
    atualizar.current = () => void ler();
    void ler();
    const relogio = window.setInterval(() => {
      if (!document.hidden) void ler();
    }, 5000);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      atualizar.current = () => undefined;
    };
  }, []);

  const abrirWindows = async () => {
    setErro(null);
    try {
      await sistema.configuracoes("bluetooth");
    } catch {
      setErro(S.semConfiguracoesBluetooth);
    }
  };

  const conectados = aparelhos?.filter((a) => a.conectado === true) ?? [];
  const outros = aparelhos?.filter((a) => a.conectado !== true) ?? [];

  const linha = (aparelho: AparelhoBluetooth) => {
    const ligado = aparelho.conectado === true;
    const acao = ligado ? S.desconectarBluetoothWindows : aparelho.conectado === false ? S.conectarBluetoothWindows : S.gerenciarBluetoothWindows;
    return (
      <button key={aparelho.id} type="button" className="bt-aparelho" data-ligado={ligado || undefined} onClick={() => void abrirWindows()} title={acao}>
        <span className="bt-icone" aria-hidden="true"><Bluetooth size={15} /></span>
        <span className="bt-texto">
          <span className="bt-nome" title={aparelho.nome}>{aparelho.nome}</span>
          <span className="bt-estado">
            <i className="bt-ponto" />
            {ligado ? S.bluetoothConectado : aparelho.conectado === false ? S.bluetoothDesconectado : S.bluetoothEstadoDesconhecido}
          </span>
        </span>
        <span className="bt-acao">
          {S.abrirBluetoothWindows}
          <ExternalLink size={11} />
        </span>
      </button>
    );
  };

  return (
    <section className="ilha-rapido-redes ilha-rapido-bluetooth" aria-label={S.aparelhos} aria-busy={ocupado}>
      <div className="bt-topo">
        <span className="bt-titulo">{S.aparelhos}</span>
        <button type="button" className="bt-botao-icone" disabled={ocupado} aria-label={S.atualizar} title={S.atualizar} onClick={() => atualizar.current()}>
          <RefreshCw size={13} className={ocupado ? "girando" : undefined} />
        </button>
        <button type="button" className="bt-botao-icone" aria-label={S.abrirWindows} title={S.abrirWindows} onClick={() => void abrirWindows()}>
          <ExternalLink size={13} />
        </button>
      </div>
      {aparelhos === null && !erro && <p className="ilha-rapido-vazio">{T.geral.carregando}</p>}
      {aparelhos?.length === 0 && <p className="ilha-rapido-vazio">{S.semAparelhos}</p>}
      <div className="ilha-rapido-bluetooth-lista">
        {conectados.length > 0 && <span className="bt-grupo">{S.bluetoothConectados}</span>}
        {conectados.map(linha)}
        {outros.length > 0 && <span className="bt-grupo">{S.bluetoothPareados}</span>}
        {outros.map(linha)}
      </div>
      {erro && <p className="ilha-rapido-vazio ilha-rapido-erro" role="alert">{erro}</p>}
      <p className="bt-dica" title={S.bluetoothDicaWindows}>{S.bluetoothDicaCurta}</p>
    </section>
  );
}

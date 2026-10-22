import { useEffect, useState } from "react";
import { Check, Pause, Play, Volume2 } from "lucide-react";
import { Botao, Modal } from "../../../componentes/basicos";
import { useInterface } from "../../../estado/interface";
import { LAYOUTS_DA_MIDIA, useConfig, type LayoutDaMidia } from "../../../estado/configuracoes";
import type { Faixa } from "../../../estado/midia";
import { T } from "../../../textos/textos";
import { CompactaDaMidia, PlayerDaMidia, type DadosDoPlayer } from "./PlayerDaMidia";
import { usarCorDaCapa } from "./corDaCapa";
import "../ilha.css";
import "./midia.css";

const E = T.ilha.estilosDaMidia;

const FAIXA_DE_EXEMPLO: Faixa = {
  titulo: E.exemplo.titulo,
  artista: E.exemplo.artista,
  app: E.exemplo.app,
  duracao: 203,
  capa: "/favicon.svg",
};

function usarDadosDeExemplo(ativo: boolean): [DadosDoPlayer, (tocando: boolean) => void] {
  const [tocando, setTocando] = useState(true);
  const [posicao, setPosicao] = useState(64);
  useEffect(() => {
    if (!ativo || !tocando) return;
    const t = window.setInterval(() => setPosicao((p) => (p + 1) % FAIXA_DE_EXEMPLO.duracao), 1000);
    return () => window.clearInterval(t);
  }, [ativo, tocando]);
  return [
    {
      faixa: FAIXA_DE_EXEMPLO,
      tocando,
      posicao,
      podeVoltar: true,
      podeAvancar: true,
      podeBuscar: true,
      alternar: () => setTocando((t) => !t),
      anterior: () => setPosicao(0),
      proxima: () => setPosicao(0),
      buscar: (s) => setPosicao(Math.max(0, Math.min(FAIXA_DE_EXEMPLO.duracao, Math.round(s)))),
    },
    setTocando,
  ];
}

function VolumeDeExemplo() {
  return (
    <div className="ilha-player-volume" aria-hidden="true">
      <span className="ilha-player-mudo">
        <Volume2 size={15} />
      </span>
      <input type="range" min={0} max={100} value={72} readOnly tabIndex={-1} style={{ ["--preenchido" as string]: "72%" }} />
      <span className="ilha-mini numero">72%</span>
    </div>
  );
}

function IlhaFechada({ layout, dados, escala = 1 }: { layout: LayoutDaMidia; dados: DadosDoPlayer; escala?: number }) {
  return (
    <div className="estilos-ilha estilos-fechada" style={{ zoom: escala }}>
      <div className="ilha-compacta" data-tipo="midia">
        <CompactaDaMidia layout={layout} dados={dados} tamanhoDaCapa={28} simulado />
      </div>
    </div>
  );
}

function IlhaAberta({ layout, dados }: { layout: LayoutDaMidia; dados: DadosDoPlayer }) {
  const cor = usarCorDaCapa(dados.faixa);
  return (
    <div className="estilos-ilha estilos-aberta">
      <div className="ilha-cartao" style={{ ["--veu" as string]: layout === "cartaz" ? "transparent" : `${cor}55` }}>
        <div className="ilha-veu" />
        <div className="ilha-cartao-corpo">
          <PlayerDaMidia layout={layout} dados={dados} simulado volume={<VolumeDeExemplo />} />
        </div>
      </div>
    </div>
  );
}

export function EstilosDaMidia() {
  const aberto = useInterface((s) => s.estilosDaMidiaAbertos);
  const fechar = () => useInterface.getState().abrirEstilosDaMidia(false);
  const emUso = useConfig((s) => s.ilha.layoutDaMidia);
  const definirIlha = useConfig((s) => s.definirIlha);
  const [vendo, setVendo] = useState<LayoutDaMidia>(emUso);
  const [dados, definirTocando] = usarDadosDeExemplo(aberto);

  useEffect(() => {
    if (aberto) setVendo(emUso);
  }, [aberto, emUso]);

  return (
    <Modal aberto={aberto} largo titulo={E.titulo} aoFechar={fechar}>
      <div className="estilos">
        <p className="campo-dica">{E.descricao}</p>
        <div className="estilos-opcoes" role="radiogroup" aria-label={E.titulo}>
          {LAYOUTS_DA_MIDIA.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={vendo === l} className="estilos-opcao" data-escolhida={vendo === l || undefined} onClick={() => setVendo(l)}>
              <span className="estilos-opcao-miniatura" aria-hidden="true">
                <IlhaFechada layout={l} dados={dados} escala={0.62} />
              </span>
              <span className="estilos-opcao-nome">
                {E.nomes[l]}
                {emUso === l && <span className="estilos-em-uso">{E.emUso}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="estilos-palco">
          <div className="estilos-palco-topo">
            <span className="estilos-rotulo">{E.fechada}</span>
            <button type="button" className="estilos-tocar" aria-label={dados.tocando ? E.pausarPrevia : E.tocarPrevia} title={dados.tocando ? E.pausarPrevia : E.tocarPrevia} onClick={() => definirTocando(!dados.tocando)}>
              {dados.tocando ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>
          <IlhaFechada layout={vendo} dados={dados} />
          <span className="estilos-rotulo">{E.aberta}</span>
          <IlhaAberta layout={vendo} dados={dados} />
        </div>
        <div className="estilos-rodape">
          <p className="estilos-detalhe">{E.detalhes[vendo]}</p>
          {emUso === vendo ? (
            <Botao disabled icone={<Check size={14} />}>{E.emUso}</Botao>
          ) : (
            <Botao variante="primario" onClick={() => definirIlha({ layoutDaMidia: vendo })}>{E.usar}</Botao>
          )}
        </div>
      </div>
    </Modal>
  );
}

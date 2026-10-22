import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { posicaoAtual, useMidia, type Faixa } from "../../../estado/midia";
import { usarCorDaCapa } from "./corDaCapa";
import type { LayoutDaMidia } from "../../../estado/configuracoes";
import { Marca, marcaDoApp } from "../../../marcas/Marca";
import { Anel } from "../../../componentes/Graficos";
import { T } from "../../../textos/textos";
import { CapaDaMidia, fundoGeradoDaCapa } from "./CapaDaMidia";
import { usarBarrasDoSom } from "./barrasDoSom";
import "./midia.css";

export interface DadosDoPlayer {
  faixa: Faixa;
  tocando: boolean;
  posicao: number;
  podeVoltar: boolean;
  podeAvancar: boolean;
  podeBuscar: boolean;
  alternar: () => void;
  anterior: () => void;
  proxima: () => void;
  buscar: (segundos: number) => void;
}

const BARRAS_DO_PULSO = 38;
const BARRAS_DA_COMPACTA = 7;

export const formatarTempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function usarDadosDaMidia(comRelogio: boolean): DadosDoPlayer | null {
  const midia = useMidia();
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    setAgora(Date.now());
    if (!comRelogio || !midia.tocando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [comRelogio, midia.tocando, midia.lidoEm]);
  if (!midia.faixa) return null;
  return {
    faixa: midia.faixa,
    tocando: midia.tocando,
    posicao: posicaoAtual(midia, agora),
    podeVoltar: midia.podeVoltar,
    podeAvancar: midia.podeAvancar,
    podeBuscar: midia.podeBuscar,
    alternar: () => void midia.alternar(),
    anterior: () => void midia.anterior(),
    proxima: () => void midia.proxima(),
    buscar: (s) => void midia.buscar(s),
  };
}

function fracao(dados: DadosDoPlayer) {
  return dados.faixa.duracao > 0 ? Math.min(1, dados.posicao / dados.faixa.duracao) : 0;
}

function propsDeBusca(dados: DadosDoPlayer) {
  const { faixa, posicao, podeBuscar, buscar } = dados;
  return {
    role: "slider",
    tabIndex: 0,
    "aria-label": T.ilha.midia,
    "aria-valuemin": 0,
    "aria-valuemax": faixa.duracao,
    "aria-valuenow": Math.round(posicao),
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (podeBuscar && faixa.duracao > 0) buscar(((e.clientX - r.left) / r.width) * faixa.duracao);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!podeBuscar || faixa.duracao <= 0) return;
      if (e.key === "ArrowRight") buscar(Math.min(faixa.duracao, posicao + 5));
      if (e.key === "ArrowLeft") buscar(Math.max(0, posicao - 5));
    },
  } as const;
}

function Trilho({ dados, className = "" }: { dados: DadosDoPlayer; className?: string }) {
  return (
    <div className={`ilha-trilho ${className}`} {...propsDeBusca(dados)}>
      <span style={{ width: `${fracao(dados) * 100}%` }} />
    </div>
  );
}

function Tempos({ dados }: { dados: DadosDoPlayer }) {
  return (
    <div className="linha-entre ilha-mini numero">
      <span>{formatarTempo(dados.posicao)}</span>
      <span>{formatarTempo(dados.faixa.duracao)}</span>
    </div>
  );
}

function Controles({ dados, grande = true }: { dados: DadosDoPlayer; grande?: boolean }) {
  return (
    <div className="linha midia-controles" style={{ gap: 4, justifyContent: "center" }}>
      <button type="button" className="ilha-botao ilha-botao-redondo" aria-label={T.ilha.anterior} disabled={!dados.podeVoltar} onClick={dados.anterior}>
        <SkipBack size={15} />
      </button>
      <button type="button" className={`ilha-botao ilha-botao-primario ${grande ? "ilha-botao-grande" : "ilha-botao-redondo"}`} aria-label={dados.tocando ? T.ilha.pausar : T.ilha.tocar} onClick={dados.alternar}>
        {dados.tocando ? <Pause size={grande ? 18 : 15} /> : <Play size={grande ? 18 : 15} />}
      </button>
      <button type="button" className="ilha-botao ilha-botao-redondo" aria-label={T.ilha.proxima} disabled={!dados.podeAvancar} onClick={dados.proxima}>
        <SkipForward size={15} />
      </button>
    </div>
  );
}

function Origem({ faixa }: { faixa: Faixa }) {
  const marca = marcaDoApp(faixa.app);
  return (
    <span className="linha ilha-midia-origem">
      {marca && (
        <span className="ilha-midia-app" title={faixa.app} aria-label={faixa.app}>
          <Marca marca={marca} tamanho={12} />
        </span>
      )}
      <span className="ilha-sub cortar privado">{faixa.artista}</span>
      {!marca && faixa.app && <span className="ilha-mini cortar">{faixa.app}</span>}
    </span>
  );
}

function Textos({ faixa, className = "" }: { faixa: Faixa; className?: string }) {
  return (
    <div className={`coluna midia-textos ${className}`}>
      <span className="ilha-titulo cortar privado">{faixa.titulo}</span>
      <Origem faixa={faixa} />
    </div>
  );
}

function OndaDeProgresso({ dados, simulado }: { dados: DadosDoPlayer; simulado?: boolean }) {
  const caixa = useRef<HTMLDivElement>(null);
  usarBarrasDoSom(caixa, dados.tocando, BARRAS_DO_PULSO, simulado);
  const tocadas = Math.round(fracao(dados) * BARRAS_DO_PULSO);
  return (
    <div className="midia-onda" {...propsDeBusca(dados)} ref={caixa}>
      {Array.from({ length: BARRAS_DO_PULSO }, (_, i) => (
        <i key={i} data-tocada={i < tocadas || undefined} />
      ))}
    </div>
  );
}

function Disco({ faixa, tocando, tamanho }: { faixa: Faixa; tocando: boolean; tamanho: number }) {
  return (
    <div className="midia-disco" data-tocando={tocando || undefined} style={{ width: tamanho, height: tamanho }}>
      <span className="midia-disco-brilho" />
      <CapaDaMidia faixa={faixa} tamanho={Math.round(tamanho * 0.42)} redonda className="midia-disco-rotulo" />
      <span className="midia-disco-furo" />
    </div>
  );
}

interface PropsDoPlayer {
  layout: LayoutDaMidia;
  dados: DadosDoPlayer;
  simulado?: boolean;
  volume?: ReactNode;
  personagem?: ReactNode;
}

export function PlayerDaMidia({ layout, dados, simulado, volume, personagem }: PropsDoPlayer) {
  const { faixa } = dados;
  const c1 = usarCorDaCapa(faixa);
  const cor = { ["--cor-capa" as string]: c1 } as CSSProperties;

  if (layout === "pulso") {
    return (
      <div className="midia-pulso" data-tocando={dados.tocando || undefined} style={cor}>
        <span className="midia-pulso-brilho" aria-hidden="true" />
        <div className="midia-pulso-capa ilha-capa-com-personagem">
          <CapaDaMidia faixa={faixa} tamanho={96} raio={14} sombra />
          {personagem}
        </div>
        <div className="midia-pulso-corpo">
          <div className="midia-pulso-topo">
            <Textos faixa={faixa} />
            <Controles dados={dados} grande={false} />
          </div>
          <OndaDeProgresso dados={dados} simulado={simulado} />
          <Tempos dados={dados} />
        </div>
      </div>
    );
  }

  if (layout === "vinil") {
    return (
      <div className="midia-vinil" style={cor}>
        <div className="midia-vinil-toca" data-tocando={dados.tocando || undefined}>
          <div className="midia-vinil-saida">
            <Disco faixa={faixa} tocando={dados.tocando} tamanho={92} />
          </div>
          <div className="midia-vinil-encarte ilha-capa-com-personagem">
            <CapaDaMidia faixa={faixa} tamanho={96} raio={6} />
            {personagem}
          </div>
        </div>
        <div className="coluna midia-vinil-meio">
          <Textos faixa={faixa} className="midia-textos-grandes" />
          <Trilho dados={dados} />
          <Tempos dados={dados} />
        </div>
        <div className="midia-vinil-lado">
          <Controles dados={dados} />
          {volume}
        </div>
      </div>
    );
  }

  if (layout === "cartaz") {
    const marca = marcaDoApp(faixa.app);
    return (
      <div className="midia-cartaz" style={cor}>
        {faixa.capa ? (
          <>
            <div className="midia-cartaz-fundo midia-cartaz-borrado" style={{ backgroundImage: `url("${faixa.capa}")` }} />
            <div className="midia-cartaz-arte" style={{ backgroundImage: `url("${faixa.capa}")` }} />
          </>
        ) : (
          <div className="midia-cartaz-fundo" style={{ background: fundoGeradoDaCapa(faixa) }}>
            <span className="midia-cartaz-marca">{marca ? <Marca marca={marca} tamanho={150} monocromatica /> : <Music size={150} strokeWidth={1.25} />}</span>
          </div>
        )}
        <div className="midia-cartaz-sombra" />
        <div className="midia-cartaz-conteudo">
          <div className="midia-cartaz-baixo">
            <div className="coluna midia-cartaz-textos">
              <span className="midia-cartaz-titulo cortar privado">{faixa.titulo}</span>
              <Origem faixa={faixa} />
            </div>
            <Controles dados={dados} />
          </div>
          <div className="midia-cartaz-progresso">
            <span className="ilha-mini numero">{formatarTempo(dados.posicao)}</span>
            <Trilho dados={dados} />
            <span className="ilha-mini numero">{formatarTempo(dados.faixa.duracao)}</span>
          </div>
        </div>
        {personagem && <div className="midia-cartaz-personagem">{personagem}</div>}
      </div>
    );
  }

  return (
    <div className="ilha-player" style={cor}>
      <div className="ilha-capa-com-personagem">
        <CapaDaMidia faixa={faixa} tamanho={96} raio={10} sombra className="ilha-capa" />
        {personagem}
      </div>
      <div className="coluna" style={{ gap: 6, flex: 1, minWidth: 0 }}>
        <Textos faixa={faixa} />
        <Trilho dados={dados} />
        <Tempos dados={dados} />
      </div>
      <div className="ilha-player-controles">
        <Controles dados={dados} />
        {volume}
      </div>
    </div>
  );
}

function OndaPequena({ tocando, simulado }: { tocando: boolean; simulado?: boolean }) {
  const caixa = useRef<HTMLSpanElement>(null);
  usarBarrasDoSom(caixa, tocando, BARRAS_DA_COMPACTA, simulado);
  return (
    <span className="midia-onda-pequena" ref={caixa}>
      {Array.from({ length: BARRAS_DA_COMPACTA }, (_, i) => <i key={i} />)}
    </span>
  );
}

export function CompactaDaMidia({ layout, dados, tamanhoDaCapa, simulado }: { layout: LayoutDaMidia; dados: DadosDoPlayer; tamanhoDaCapa: number; simulado?: boolean }) {
  const { faixa, tocando } = dados;
  const c1 = usarCorDaCapa(faixa);

  if (layout === "pulso") {
    return (
      <>
        <div className="ilha-compacta-lado">
          <CapaDaMidia faixa={faixa} tamanho={tamanhoDaCapa} raio={8} />
        </div>
        <span className="ilha-compacta-texto privado">{faixa.titulo}</span>
        <div className="ilha-compacta-lado" style={{ ["--cor-capa" as string]: c1 }}>
          <OndaPequena tocando={tocando} simulado={simulado} />
        </div>
      </>
    );
  }

  if (layout === "vinil") {
    return (
      <>
        <div className="ilha-compacta-lado">
          <span className="midia-disco-pequeno" data-tocando={tocando || undefined}>
            <CapaDaMidia faixa={faixa} tamanho={tamanhoDaCapa - 2} redonda />
          </span>
        </div>
        <span className="ilha-compacta-texto midia-compacta-dupla privado">
          <span className="cortar">{faixa.titulo}</span>
          {faixa.artista && <span className="midia-compacta-artista cortar">{faixa.artista}</span>}
        </span>
        <div className="ilha-compacta-lado">
          <span className="ilha-mini numero">{faixa.duracao > 0 ? T.ilha.estilosDaMidia.restante(formatarTempo(Math.max(0, faixa.duracao - dados.posicao))) : ""}</span>
        </div>
      </>
    );
  }

  if (layout === "cartaz") {
    const marca = marcaDoApp(faixa.app);
    return (
      <>
        <div className="ilha-compacta-lado">
          <span className="midia-cartaz-ponto" style={{ ["--cor-capa" as string]: c1 }}>
            {marca ? <Marca marca={marca} tamanho={12} monocromatica /> : <Music size={12} />}
          </span>
        </div>
        <span className="ilha-compacta-texto midia-compacta-destaque privado">{faixa.titulo}</span>
        <div className="ilha-compacta-lado">
          <span className="midia-anel-compacto">
            <Anel progresso={fracao(dados)} tamanho={18} espessura={2.5} cor={c1} />
            {tocando ? <Pause size={7} fill="currentColor" strokeWidth={0} /> : <Play size={7} fill="currentColor" strokeWidth={0} />}
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ilha-compacta-lado">
        <CapaDaMidia faixa={faixa} tamanho={tamanhoDaCapa} raio={8} />
      </div>
      <span className="ilha-compacta-texto privado">{faixa.titulo}</span>
      <div className="ilha-compacta-lado">
        <span className={`ilha-onda ${tocando ? "" : "parada"}`}>
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </>
  );
}

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { normalizarTexto } from "../utilitarios/basicos";
import "./caixaDeEscolha.css";

// Adaptado do Combobox do EasyUI (MIT, Suraj Maurya). Licença em licencas/easyui.txt.

export interface OpcaoDeEscolha {
  valor: string;
  rotulo: string;
  descricao?: string;
  icone?: ReactNode;
  palavras?: string[];
  desativada?: boolean;
}

interface Props {
  id?: string;
  opcoes: OpcaoDeEscolha[];
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder: string;
  textoDaBusca: string;
  textoSemResultado: string;
  rotuloAcessivel?: string;
  desativada?: boolean;
  invalida?: boolean;
}

const ALTURA_DA_LISTA = 330;
const LARGURA_MINIMA = 224;
const MOLA = { type: "spring", stiffness: 520, damping: 40, mass: 0.6 } as const;

export function filtrarOpcoes(opcoes: OpcaoDeEscolha[], busca: string): OpcaoDeEscolha[] {
  const q = normalizarTexto(busca.trim());
  if (!q) return opcoes;
  return opcoes.filter((o) => [o.rotulo, o.descricao, ...(o.palavras ?? [])].some((s) => s && normalizarTexto(s).includes(q)));
}

const primeiraLivre = (lista: OpcaoDeEscolha[]) => lista.findIndex((o) => !o.desativada);

function Destaque({ texto, busca }: { texto: string; busca: string }) {
  const q = normalizarTexto(busca.trim());
  const i = q ? normalizarTexto(texto).indexOf(q) : -1;
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <span className="escolha-achado">{texto.slice(i, i + q.length)}</span>
      {texto.slice(i + q.length)}
    </>
  );
}

function Painel({ id, opcoes, valor, textoDaBusca, textoSemResultado, aoEscolher, aoFechar }: { id: string; opcoes: OpcaoDeEscolha[]; valor: string; textoDaBusca: string; textoSemResultado: string; aoEscolher: (v: string) => void; aoFechar: () => void }) {
  const [busca, setBusca] = useState("");
  const itens = useMemo(() => filtrarOpcoes(opcoes, busca), [opcoes, busca]);
  const [ativo, setAtivo] = useState(() => {
    const i = opcoes.findIndex((o) => o.valor === valor);
    return i >= 0 ? i : primeiraLivre(opcoes);
  });
  const [faixa, setFaixa] = useState<{ y: number; h: number } | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const linhas = useRef<(HTMLDivElement | null)[]>([]);
  const peloTeclado = useRef(false);

  useEffect(() => {
    campo.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const el = linhas.current[ativo];
    const lista = rolagem.current;
    if (!el || !lista) {
      setFaixa(null);
      return;
    }
    setFaixa({ y: el.offsetTop, h: el.offsetHeight });
    if (!peloTeclado.current) return;
    peloTeclado.current = false;
    if (el.offsetTop < lista.scrollTop) lista.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > lista.scrollTop + lista.clientHeight) lista.scrollTop = el.offsetTop + el.offsetHeight - lista.clientHeight + 4;
  }, [ativo, itens]);

  const mover = (passo: 1 | -1) => {
    if (!itens.length) return;
    let i = ativo;
    for (let n = 0; n < itens.length; n++) {
      i = (i + passo + itens.length) % itens.length;
      if (!itens[i].desativada) {
        peloTeclado.current = true;
        setAtivo(i);
        return;
      }
    }
  };

  return (
    <>
      <div className="escolha-busca">
        <Search size={14} aria-hidden="true" />
        <input
          ref={campo}
          value={busca}
          placeholder={textoDaBusca}
          role="combobox"
          aria-expanded
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={itens[ativo] ? `${id}-${ativo}` : undefined}
          onChange={(e) => {
            setBusca(e.target.value);
            setAtivo(primeiraLivre(filtrarOpcoes(opcoes, e.target.value)));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              mover(e.key === "ArrowDown" ? 1 : -1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const o = itens[ativo];
              if (o && !o.desativada) aoEscolher(o.valor);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              aoFechar();
            } else if (e.key === "Tab") aoFechar();
          }}
        />
      </div>
      <div ref={rolagem} className="escolha-rolagem">
        <div id={id} role="listbox" className="escolha-lista">
          {faixa && itens.length > 0 && <motion.div aria-hidden="true" className="escolha-faixa" initial={false} animate={{ y: faixa.y, height: faixa.h }} transition={MOLA} />}
          {itens.map((o, i) => (
            <div
              key={o.valor}
              id={`${id}-${i}`}
              ref={(el) => {
                linhas.current[i] = el;
              }}
              role="option"
              aria-selected={o.valor === valor}
              aria-disabled={o.desativada || undefined}
              className="escolha-opcao"
              data-ativa={ativo === i || undefined}
              onMouseMove={() => !o.desativada && ativo !== i && setAtivo(i)}
              onClick={() => !o.desativada && aoEscolher(o.valor)}
            >
              {o.icone && <span className="escolha-icone">{o.icone}</span>}
              <span className="escolha-textos">
                <span className="escolha-rotulo"><Destaque texto={o.rotulo} busca={busca} /></span>
                {o.descricao && <span className="escolha-descricao">{o.descricao}</span>}
              </span>
              {o.valor === valor && (
                <motion.span className="escolha-marcada" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={MOLA}>
                  <Check size={14} />
                </motion.span>
              )}
            </div>
          ))}
          {itens.length === 0 && <p className="escolha-vazia">{textoSemResultado}</p>}
        </div>
      </div>
    </>
  );
}

export function CaixaDeEscolha({ id, opcoes, valor, aoMudar, placeholder, textoDaBusca, textoSemResultado, rotuloAcessivel, desativada, invalida }: Props) {
  const [aberta, setAberta] = useState(false);
  const [posicao, setPosicao] = useState<{ x: number; y: number; largura: number; acima: boolean } | null>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const idDaLista = useId();
  const atual = opcoes.find((o) => o.valor === valor);

  useLayoutEffect(() => {
    if (!aberta) return;
    const posicionar = () => {
      const r = gatilho.current?.getBoundingClientRect();
      if (!r) return;
      const abaixo = window.innerHeight - r.bottom;
      const alturaEstimada = Math.min(ALTURA_DA_LISTA, 64 + Math.max(1, opcoes.length) * 40);
      const acima = abaixo < alturaEstimada && r.top > abaixo;
      setPosicao({ x: Math.min(r.left, window.innerWidth - Math.max(r.width, LARGURA_MINIMA) - 8), y: acima ? r.top - 6 : r.bottom + 6, largura: Math.max(r.width, LARGURA_MINIMA), acima });
    };
    posicionar();
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [aberta, opcoes.length]);

  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!painel.current?.contains(alvo) && !gatilho.current?.contains(alvo)) setAberta(false);
    };
    document.addEventListener("pointerdown", fora, true);
    return () => document.removeEventListener("pointerdown", fora, true);
  }, [aberta]);

  const fechar = () => {
    setAberta(false);
    gatilho.current?.focus();
  };

  const destino = document.getElementById("camada-sistema") ?? document.body;

  return (
    <>
      <button
        ref={gatilho}
        id={id}
        type="button"
        role="combobox"
        className="escolha-gatilho"
        aria-expanded={aberta}
        aria-haspopup="listbox"
        aria-controls={aberta ? idDaLista : undefined}
        aria-label={rotuloAcessivel}
        aria-invalid={invalida || undefined}
        disabled={desativada}
        data-aberta={aberta || undefined}
        onClick={() => setAberta((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setAberta(true);
          }
        }}
      >
        {atual?.icone && <span className="escolha-icone">{atual.icone}</span>}
        <span className="escolha-valor" data-vazia={!atual || undefined}>{atual?.rotulo ?? placeholder}</span>
        <ChevronsUpDown size={14} aria-hidden="true" />
      </button>
      {createPortal(
        <AnimatePresence>
          {aberta && posicao && (
            <motion.div
              ref={painel}
              className={`escolha-painel${destino === document.body ? " estilo-sistema" : ""}`}
              style={{ left: posicao.x, top: posicao.y, width: posicao.largura, transformOrigin: posicao.acima ? "bottom left" : "top left", translateY: posicao.acima ? "-100%" : 0 }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
              transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.7 }}
            >
              <Painel
                id={idDaLista}
                opcoes={opcoes}
                valor={valor}
                textoDaBusca={textoDaBusca}
                textoSemResultado={textoSemResultado}
                aoFechar={fechar}
                aoEscolher={(v) => {
                  aoMudar(v);
                  fechar();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        destino,
      )}
    </>
  );
}

import { useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { hexValido, textoSobre } from "../utilitarios/cores";
import "./carteiraDeContas.css";

// Adaptado do WalletBalance do EasyUI (MIT, Suraj Maurya). Licença em licencas/easyui.txt.

export interface ContaNaCarteira {
  id: string;
  nome: string;
  saldo: number;
  cor: string;
}

interface Props {
  contas: ContaNaCarteira[];
  visivel: boolean;
  aoMudarVisivel: (visivel: boolean) => void;
  formatar: (valor: number) => string;
  rotuloDoTotal: string;
  rotuloMostrar: string;
  rotuloEsconder: string;
  rotuloEscondido: string;
  rotuloDoGrupo: string;
}

const PALCO_L = 340;
const PALCO_A = 400;
const CARTAO_L = 266;
const CARTAO_A = 130;
const CARTAO_X = (PALCO_L - CARTAO_L) / 2;
const ESCALA_ESCONDIDA = 0.89;
const MAXIMO = 3;
const BOLSO_TOPO = 179;
const MASCARA = "••••••";
const SAIDA = [0.23, 1, 0.32, 1] as const;

const topoVisivel = (i: number) => 13 + i * 49.5;
const topoEscondido = (i: number) => 75 + i * 35;

function Troca({ mostrar, valor, classe }: { mostrar: boolean; valor: string; classe?: string }) {
  const reduzir = useReducedMotion();
  return (
    <span className="carteira-troca">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={mostrar ? "valor" : "mascara"}
          className={classe}
          initial={{ opacity: 0, filter: reduzir ? "blur(0px)" : "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: reduzir ? "blur(0px)" : "blur(4px)" }}
          transition={{ duration: reduzir ? 0 : 0.18, ease: SAIDA }}
        >
          {mostrar ? valor : MASCARA}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Olho({ aberto }: { aberto: boolean }) {
  const reduzir = useReducedMotion();
  const t = { duration: reduzir ? 0 : 0.28, ease: SAIDA };
  return (
    <motion.svg viewBox="0 0 34 24" className="carteira-olho" initial={false} animate={{ opacity: aberto ? 1 : 0.7 }} transition={t} aria-hidden="true">
      <path d="M1.5 12C5.5 5 10.5 1.5 17 1.5S28.5 5 32.5 12c-4 7-9 10.5-15.5 10.5S5.5 19 1.5 12Z" className="carteira-olho-globo" />
      <circle cx="17" cy="12" r="6.6" className="carteira-olho-iris" />
      <circle cx="17" cy="12" r="3.6" className="carteira-olho-globo" />
      <motion.path d="M5 22.5 29 1.5" className="carteira-olho-corte-fundo" initial={false} animate={{ pathLength: aberto ? 0 : 1, opacity: aberto ? 0 : 1 }} transition={t} />
      <motion.path d="M5 22.5 29 1.5" className="carteira-olho-corte" initial={false} animate={{ pathLength: aberto ? 0 : 1, opacity: aberto ? 0 : 1 }} transition={t} />
    </motion.svg>
  );
}

export function CarteiraDeContas({ contas, visivel, aoMudarVisivel, formatar, rotuloDoTotal, rotuloMostrar, rotuloEsconder, rotuloEscondido, rotuloDoGrupo }: Props) {
  const uid = useId().replace(/:/g, "");
  const reduzir = useReducedMotion();
  const lista = contas.slice(0, MAXIMO);
  const total = contas.reduce((s, c) => s + c.saldo, 0);
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / PALCO_L);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const mola = (atraso: number) => (reduzir ? { duration: 0 } : ({ type: "spring", duration: 0.5, bounce: 0.16, delay: atraso } as const));

  return (
    <div ref={caixa} role="group" aria-label={rotuloDoGrupo} className="carteira" style={{ aspectRatio: `${PALCO_L} / ${PALCO_A}` }}>
      <div className="carteira-palco" style={{ width: PALCO_L, height: PALCO_A, transform: `scale(${escala ?? 1})`, opacity: escala === null ? 0 : 1 }}>
        <svg viewBox={`0 0 ${PALCO_L} ${PALCO_A}`} width={PALCO_L} height={PALCO_A} className="carteira-camada carteira-bolsa-fundo" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-fundo`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="carteira-cor-fundo-1" />
              <stop offset="100%" className="carteira-cor-fundo-2" />
            </linearGradient>
          </defs>
          <path d="M20 112C20 102 28 96 38 96H302C312 96 320 102 320 112V316A66 66 0 0 1 254 382H86A66 66 0 0 1 20 316Z" fill={`url(#${uid}-fundo)`} />
        </svg>

        {lista.map((c, i) => {
          const atraso = (visivel ? i : lista.length - 1 - i) * 0.03;
          const cor = hexValido(c.cor) ? c.cor : "#8a8a8f";
          return (
            <motion.div
              key={c.id}
              className="carteira-cartao"
              style={{ left: CARTAO_X, top: 0, width: CARTAO_L, height: CARTAO_A, zIndex: i + 1, background: `linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 45%), ${cor}`, color: textoSobre(cor) }}
              initial={false}
              animate={{ y: visivel ? topoVisivel(i) : topoEscondido(i), scale: visivel ? 1 : ESCALA_ESCONDIDA }}
              transition={mola(atraso)}
            >
              <div className="carteira-cartao-linha">
                <span className="carteira-cartao-nome">{c.nome}</span>
                <span className="carteira-cartao-valor numero privado">
                  <Troca mostrar={visivel} valor={formatar(c.saldo)} />
                </span>
              </div>
            </motion.div>
          );
        })}

        <svg viewBox={`0 0 ${PALCO_L} ${PALCO_A}`} width={PALCO_L} height={PALCO_A} className="carteira-camada carteira-bolso" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-frente`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="carteira-cor-frente-1" />
              <stop offset="100%" className="carteira-cor-frente-2" />
            </linearGradient>
          </defs>
          <path d={`M30 198C30 188 41 ${BOLSO_TOPO} 54 ${BOLSO_TOPO}L286 ${BOLSO_TOPO}C299 ${BOLSO_TOPO + 1} 310 188 310 198V322A56 56 0 0 1 254 378H86A56 56 0 0 1 30 322Z`} fill={`url(#${uid}-frente)`} className="carteira-bolso-borda" />
          <path d="M38 199C38 192 46 187 56 187L284 187C294 187 302 192 302 199V322A48 48 0 0 1 254 370H86A48 48 0 0 1 38 322Z" className="carteira-costura" />
        </svg>

        <div className="carteira-total" style={{ top: 191 }}>
          <div className="carteira-total-linha">
            <span className="numero privado">
              <Troca mostrar={visivel} valor={formatar(total)} classe={visivel ? "carteira-total-valor" : "carteira-total-mascara"} />
            </span>
          </div>
          <p className="carteira-total-rotulo">{rotuloDoTotal}</p>
        </div>

        <button type="button" className="carteira-botao" style={{ left: PALCO_L / 2 - 28, top: 306 }} aria-pressed={visivel} aria-label={visivel ? rotuloEsconder : rotuloMostrar} title={visivel ? rotuloEsconder : rotuloMostrar} onClick={() => aoMudarVisivel(!visivel)}>
          <Olho aberto={visivel} />
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{visivel ? `${rotuloDoTotal} ${formatar(total)}` : rotuloEscondido}</span>
    </div>
  );
}

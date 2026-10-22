import { useEffect, useId, useRef, useState, type KeyboardEvent as EventoDeTecla, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { T } from "../textos/textos";
import "./tourGuiado.css";

// Adaptado do ProductTour do EasyUI (MIT, Suraj Maurya). Licença em licencas/easyui.txt.

export type LadoDoTour = "auto" | "cima" | "baixo" | "esquerda" | "direita";

export interface PassoDoTour {
  alvo?: string;
  titulo: string;
  texto: ReactNode;
  lado?: LadoDoTour;
  folga?: number;
}

export type MotivoDoFim = "concluiu" | "pulou" | "fechou";

interface Props {
  passos: PassoDoTour[];
  aberto: boolean;
  aoFechar: (motivo: MotivoDoFim) => void;
}

type Retangulo = { x: number; y: number; w: number; h: number; r: number };

const LARGURA_DO_CARTAO = 340;
const LARGURA_DA_FOLHA = 440;
const TELA_PEQUENA = 640;
const larguraDoCartao = (vw: number) => (vw < TELA_PEQUENA ? Math.min(LARGURA_DA_FOLHA, vw - 24) : LARGURA_DO_CARTAO);
const SAIDA = [0.23, 1, 0.32, 1] as const;
const MOLA_DO_RECORTE = { type: "spring", stiffness: 380, damping: 38, mass: 0.9 } as const;
const MOLA_DO_CARTAO = { type: "spring", stiffness: 320, damping: 34, mass: 0.9 } as const;

const limitar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const quadro = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function achar(alvo?: string): HTMLElement | null {
  if (!alvo) return null;
  const el = document.querySelector<HTMLElement>(alvo);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

function retanguloDe(el: HTMLElement, passo: PassoDoTour): Retangulo {
  const b = el.getBoundingClientRect();
  const p = passo.folga ?? 8;
  const w = b.width + p * 2;
  const h = b.height + p * 2;
  const raioCss = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return { x: b.left - p, y: b.top - p, w, h, r: Math.min(Math.max(raioCss + p, 8), Math.min(w, h) / 2) };
}

async function preparar(passo: PassoDoTour, instantaneo: boolean) {
  if (!passo.alvo) return null;
  let el = achar(passo.alvo);
  for (let i = 0; !el && i < 36; i++) {
    await quadro();
    el = achar(passo.alvo);
  }
  if (!el) return null;
  const b = el.getBoundingClientRect();
  const cabeNaTela = b.height <= window.innerHeight - 48;
  const visivel = cabeNaTela ? b.top >= 24 && b.bottom <= window.innerHeight - 24 && b.left >= 0 && b.right <= window.innerWidth : b.top < window.innerHeight && b.bottom > 0;
  if (!visivel) {
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: instantaneo ? "auto" : "smooth" });
    let ultimo = el.getBoundingClientRect().top;
    let parado = 0;
    const inicio = performance.now();
    while (parado < 6 && performance.now() - inicio < 1000) {
      await quadro();
      const topo = el.getBoundingClientRect().top;
      parado = Math.abs(topo - ultimo) < 0.5 ? parado + 1 : 0;
      ultimo = topo;
    }
  }
  return el;
}

const PREFERENCIA: Record<LadoDoTour, "bottom" | "top" | "right" | "left" | "auto"> = { auto: "auto", cima: "top", baixo: "bottom", esquerda: "left", direita: "right" };

export function posicionarCartao(r: Retangulo | null, cw: number, ch: number, vw: number, vh: number, lado: LadoDoTour = "auto") {
  const M = 16;
  const G = 14;
  if (!r) return { x: (vw - cw) / 2, y: (vh - ch) / 2 };
  if (vw < TELA_PEQUENA) return { x: (vw - cw) / 2, y: Math.max(12, vh - ch - 12) };
  const espaco = { bottom: vh - (r.y + r.h) - M - ch - G, top: r.y - M - ch - G, right: vw - (r.x + r.w) - M - cw - G, left: r.x - M - cw - G };
  const todos = ["bottom", "top", "right", "left"] as const;
  const preferido = PREFERENCIA[lado];
  const ordem = preferido === "auto" ? todos : [preferido, ...todos.filter((s) => s !== preferido)];
  const escolhido = ordem.find((s) => espaco[s] >= 0) ?? todos.reduce((a, b) => (espaco[a] > espaco[b] ? a : b));
  let x = r.x + r.w / 2 - cw / 2;
  let y = r.y + r.h / 2 - ch / 2;
  if (escolhido === "bottom") y = r.y + r.h + G;
  if (escolhido === "top") y = r.y - G - ch;
  if (escolhido === "right") x = r.x + r.w + G;
  if (escolhido === "left") x = r.x - G - cw;
  return { x: limitar(x, M, Math.max(M, vw - cw - M)), y: limitar(y, M, Math.max(M, vh - ch - M)) };
}

const deslizar = {
  entrar: (d: number) => ({ opacity: 0, x: d * 20, filter: "blur(3px)" }),
  centro: { opacity: 1, x: 0, filter: "blur(0px)" },
  sair: (d: number) => ({ opacity: 0, x: d * -20, filter: "blur(3px)" }),
};

export function TourGuiado({ passos, aberto, aoFechar }: Props) {
  const uid = useId().replace(/:/g, "");
  const reduzir = useReducedMotion();
  const R = T.tour;
  const [indice, setIndice] = useState(0);
  const [pronto, setPronto] = useState(false);
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) setIndice(0);
    else setPronto(false);
  }

  const sx = useMotionValue(0);
  const sy = useMotionValue(0);
  const sw = useMotionValue(0);
  const sh = useMotionValue(0);
  const sr = useMotionValue(0);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const alturaDoTexto = useMotionValue(0);
  const w = useTransform(sw, (v) => Math.max(0, v));
  const h = useTransform(sh, (v) => Math.max(0, v));
  const raio = useTransform(sr, (v) => Math.max(0, v));

  const retangulo = useRef<Retangulo | null>(null);
  const elemento = useRef<HTMLElement | null>(null);
  const alturaDoCartao = useRef(0);
  const primeiro = useRef(true);
  const preparando = useRef(false);
  const movendo = useRef(false);
  const direcao = useRef(1);
  const relogioDoMovimento = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const observador = useRef<ResizeObserver | null>(null);
  const focoAnterior = useRef<Element | null>(null);
  const cartao = useRef<HTMLDivElement>(null);
  const regiao = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement | null>(null);
  const proximo = useRef<HTMLButtonElement>(null);

  const passo = passos[indice];
  const passoAtual = useRef(passo);
  passoAtual.current = passo;

  const mover = (mv: MotionValue<number>, para: number, modo: "mola" | "instantaneo", mola: typeof MOLA_DO_RECORTE | typeof MOLA_DO_CARTAO = MOLA_DO_RECORTE) => {
    if (modo === "instantaneo" || reduzir) {
      mv.stop();
      mv.set(para);
    } else animate(mv, para, mola);
  };

  const posicionarRecorte = (modo: "mola" | "instantaneo", entrada = false) => {
    const r = retangulo.current;
    const c = r ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0, r: 0 };
    if (entrada && !reduzir && r) {
      sx.set(c.x - 48);
      sy.set(c.y - 48);
      sw.set(Math.max(0, c.w + 96));
      sh.set(Math.max(0, c.h + 96));
      sr.set(Math.max(0, c.r + 16));
    }
    mover(sx, c.x, modo);
    mover(sy, c.y, modo);
    mover(sw, Math.max(0, c.w), modo);
    mover(sh, Math.max(0, c.h), modo);
    mover(sr, Math.max(0, c.r), modo);
  };

  const moverCartao = (modo: "mola" | "instantaneo") => {
    const p = posicionarCartao(retangulo.current, larguraDoCartao(window.innerWidth), alturaDoCartao.current, window.innerWidth, window.innerHeight, passoAtual.current?.lado);
    mover(cx, p.x, modo, MOLA_DO_CARTAO);
    mover(cy, p.y, modo, MOLA_DO_CARTAO);
  };

  const ir = (i: number) => {
    if (i < 0) return;
    if (i >= passos.length) return aoFechar("concluiu");
    direcao.current = i > indice ? 1 : -1;
    setIndice(i);
  };

  useEffect(() => {
    if (!aberto || !passo) return;
    let cancelado = false;
    preparando.current = true;
    void (async () => {
      const el = await preparar(passo, Boolean(reduzir));
      if (cancelado) return;
      elemento.current = el;
      retangulo.current = el ? retanguloDe(el, passo) : null;
      observador.current?.disconnect();
      if (el) observador.current?.observe(el);
      preparando.current = false;
      movendo.current = true;
      clearTimeout(relogioDoMovimento.current);
      relogioDoMovimento.current = setTimeout(() => (movendo.current = false), 700);
      const entrada = primeiro.current;
      primeiro.current = false;
      posicionarRecorte("mola", entrada);
      moverCartao(entrada ? "instantaneo" : "mola");
    })();
    return () => {
      cancelado = true;
    };
  }, [aberto, indice]);

  useEffect(() => {
    if (!aberto) return;
    const el = conteudo.current;
    if (!el) return;
    const medir = () => {
      const c = cartao.current;
      const r = regiao.current;
      if (!c || !r) return;
      const limite = window.innerWidth < TELA_PEQUENA ? window.innerHeight * 0.4 : window.innerHeight - 160;
      const alturaDoConteudo = Math.min(el.offsetHeight, Math.max(96, limite));
      const moldura = c.offsetHeight - r.offsetHeight;
      const inicio = alturaDoCartao.current === 0;
      alturaDoCartao.current = alturaDoConteudo + moldura;
      mover(alturaDoTexto, alturaDoConteudo, inicio ? "instantaneo" : "mola", MOLA_DO_CARTAO);
      if (!preparando.current) moverCartao(inicio ? "instantaneo" : "mola");
      setPronto(true);
    };
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    medir();
    return () => obs.disconnect();
  }, [aberto, indice]);

  useEffect(() => {
    if (!aberto) return;
    let raf = 0;
    const atualizar = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (preparando.current) return;
        const p = passoAtual.current;
        const el = elemento.current?.isConnected ? elemento.current : achar(p?.alvo);
        if (el && p) {
          elemento.current = el;
          retangulo.current = retanguloDe(el, p);
        }
        const modo = movendo.current ? "mola" : "instantaneo";
        posicionarRecorte(modo);
        moverCartao(modo);
      });
    };
    observador.current = new ResizeObserver(atualizar);
    if (elemento.current) observador.current.observe(elemento.current);
    window.addEventListener("scroll", atualizar, { capture: true, passive: true });
    window.addEventListener("resize", atualizar);
    return () => {
      cancelAnimationFrame(raf);
      observador.current?.disconnect();
      window.removeEventListener("scroll", atualizar, true);
      window.removeEventListener("resize", atualizar);
    };
  }, [aberto]);

  useEffect(() => {
    if (aberto) return;
    primeiro.current = true;
    alturaDoCartao.current = 0;
    retangulo.current = null;
    elemento.current = null;
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        aoFechar("fechou");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        ir(indice + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        ir(indice - 1);
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [aberto, indice]);

  useEffect(() => {
    if (!aberto) return;
    focoAnterior.current = document.activeElement;
    return () => (focoAnterior.current as HTMLElement | null)?.focus?.({ preventScroll: true });
  }, [aberto]);

  useEffect(() => {
    if (aberto && pronto) proximo.current?.focus({ preventScroll: true });
  }, [aberto, pronto]);

  const prenderTab = (e: EventoDeTecla) => {
    if (e.key !== "Tab") return;
    const botoes = cartao.current?.querySelectorAll<HTMLElement>("button");
    if (!botoes?.length) return;
    const p = botoes[0];
    const u = botoes[botoes.length - 1];
    if (e.shiftKey && document.activeElement === p) {
      e.preventDefault();
      u.focus();
    } else if (!e.shiftKey && document.activeElement === u) {
      e.preventDefault();
      p.focus();
    }
  };

  const ultimo = indice === passos.length - 1;

  return createPortal(
    <AnimatePresence>
      {aberto && passo && (
        <motion.div key="tour" className="tour estilo-sistema" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: SAIDA }}>
          <svg className="tour-sombra" aria-hidden="true">
            <defs>
              <mask id={`${uid}-mascara`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
                <rect width="100%" height="100%" fill="white" />
                <motion.rect x={sx} y={sy} width={w} height={h} rx={raio} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" className="tour-escurecido" mask={`url(#${uid}-mascara)`} />
            <motion.rect x={sx} y={sy} width={w} height={h} rx={raio} className="tour-contorno" />
          </svg>
          <motion.div
            ref={cartao}
            role="dialog"
            aria-modal="true"
            aria-label={R.rotulo}
            onKeyDown={prenderTab}
            className="tour-cartao"
            style={{ x: cx, y: cy }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: pronto ? 1 : 0, scale: pronto ? 1 : 0.96 }}
            transition={{ duration: 0.2, ease: SAIDA }}
          >
            <div className="tour-topo">
              <span className="numero">{R.contagem(indice + 1, passos.length)}</span>
              <button type="button" className="tour-pular" onClick={() => aoFechar("pulou")}>{R.pular}</button>
            </div>
            <motion.div ref={regiao} className="tour-regiao" style={{ height: alturaDoTexto }} aria-live="polite">
              <AnimatePresence mode="popLayout" initial={false} custom={direcao.current}>
                <motion.div
                  key={indice}
                  ref={(el) => {
                    if (el) conteudo.current = el;
                  }}
                  custom={direcao.current}
                  variants={deslizar}
                  initial="entrar"
                  animate="centro"
                  exit="sair"
                  transition={{ duration: 0.2, ease: SAIDA }}
                  className="tour-conteudo"
                >
                  <h2 className="tour-titulo">{passo.titulo}</h2>
                  <div className="tour-texto">{passo.texto}</div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
            <div className="tour-rodape">
              <div className="tour-pontos">
                {passos.map((_, i) => (
                  <button key={i} type="button" className="tour-ponto" aria-label={R.irPara(i + 1)} aria-current={i === indice} onClick={() => ir(i)}>
                    <span />
                  </button>
                ))}
              </div>
              <div className="tour-botoes">
                {indice > 0 && (
                  <button type="button" className="tour-botao tour-botao-voltar" onClick={() => ir(indice - 1)}>
                    {R.voltar}
                  </button>
                )}
                <button ref={proximo} type="button" className="tour-botao tour-botao-proximo" onClick={() => ir(indice + 1)}>
                  {ultimo ? R.concluir : R.proximo}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

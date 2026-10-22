import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import "./graficoDeArea.css";

// Adaptado do InteractiveAreaChart do EasyUI (MIT, Suraj Maurya). Licença em licencas/easyui.txt.

export interface PontoDoGrafico {
  data: number;
  valor: number;
}

interface Props {
  series: Record<string, PontoDoGrafico[]>;
  rotulosDosPeriodos: Record<string, string>;
  periodoInicial: string;
  titulo: string;
  altura?: number;
  formatarValor: (valor: number) => string;
  formatarCompacto: (valor: number) => string;
  formatarDia: (data: number) => string;
  formatarEixo: (data: number, pontos: number) => string;
  descrever: (periodo: string, de: string, ate: string) => string;
}

const AMOSTRAS = 72;
const MARGEM = { t: 16, r: 12, b: 26, l: 64 };
const LARGURA_DA_DICA = 140;
const SAIDA = [0.23, 1, 0.32, 1] as const;
const IDA_E_VOLTA = [0.77, 0, 0.175, 1] as const;

const limitar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const arredondar = (n: number) => Math.round(n * 100) / 100;

export function tangentesMonotonas(v: number[]) {
  const n = v.length;
  const m = new Float64Array(n);
  if (n < 2) return m;
  const d = Array.from({ length: n - 1 }, (_, i) => v[i + 1] - v[i]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  return m;
}

export function curvaMonotona(v: number[], m: Float64Array, posicao: number) {
  const n = v.length;
  if (n === 1) return v[0];
  const i = Math.min(Math.floor(posicao), n - 2);
  const t = posicao - i;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v[i] + (t3 - 2 * t2 + t) * m[i] + (-2 * t3 + 3 * t2) * v[i + 1] + (t3 - t2) * m[i + 1];
}

export function escalaBonita(min: number, max: number, quantidade = 4) {
  const bruto = (max - min || Math.abs(max) || 1) / (quantidade - 1);
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / magnitude;
  const passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * magnitude;
  const baixo = Math.floor(min / passo) * passo;
  let alto = Math.ceil(max / passo) * passo;
  if (alto === baixo) alto = baixo + passo;
  const marcas: number[] = [];
  for (let v = baixo; v <= alto + passo / 2; v += passo) marcas.push(v);
  return { baixo, alto, marcas };
}

function montarModelo(series: Record<string, PontoDoGrafico[]>) {
  const saida: Record<string, { pontos: PontoDoGrafico[]; normalizados: Float64Array; baixo: number; alto: number; marcas: number[] }> = {};
  for (const [chave, pontos] of Object.entries(series)) {
    if (!pontos.length) continue;
    const valores = pontos.map((p) => p.valor);
    const { baixo, alto, marcas } = escalaBonita(Math.min(...valores), Math.max(...valores));
    const normalizados = new Float64Array(AMOSTRAS);
    const tangentes = tangentesMonotonas(valores);
    for (let k = 0; k < AMOSTRAS; k++) normalizados[k] = (curvaMonotona(valores, tangentes,(k / (AMOSTRAS - 1)) * (valores.length - 1)) - baixo) / (alto - baixo);
    saida[chave] = { pontos, normalizados, baixo, alto, marcas };
  }
  return saida;
}

function caminhoSuave(p: [number, number][]) {
  let d = `M${arredondar(p[0][0])} ${arredondar(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    d += `C${arredondar(p1[0] + (p2[0] - p0[0]) / 6)} ${arredondar(p1[1] + (p2[1] - p0[1]) / 6)} ${arredondar(p2[0] - (p3[0] - p1[0]) / 6)} ${arredondar(p2[1] - (p3[1] - p1[1]) / 6)} ${arredondar(p2[0])} ${arredondar(p2[1])}`;
  }
  return d;
}

export function GraficoDeArea({ series, rotulosDosPeriodos, periodoInicial, titulo, altura = 240, formatarValor, formatarCompacto, formatarDia, formatarEixo, descrever }: Props) {
  const uid = useId().replace(/:/g, "");
  const reduzir = useReducedMotion();
  const modelo = useMemo(() => montarModelo(series), [series]);
  const chaves = Object.keys(modelo);
  const [periodo, setPeriodo] = useState(chaves.includes(periodoInicial) ? periodoInicial : chaves[0]);
  const [sobre, setSobre] = useState<number | null>(null);
  const [largura, setLargura] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const de = useRef<Float64Array>(modelo[periodo]?.normalizados ?? new Float64Array(AMOSTRAS));
  const para = useRef<Float64Array>(modelo[periodo]?.normalizados ?? new Float64Array(AMOSTRAS));
  const transicao = useRef<{ stop: () => void } | null>(null);
  const comecou = useRef(false);
  const ultimoSobre = useRef(0);

  const t = useMotionValue(1);
  const versao = useMotionValue(0);
  const larguraMV = useMotionValue(0);
  const revelado = useMotionValue(reduzir ? 1 : 0);
  const cursor = useMotionValue(0);
  const cursorSuave = useSpring(cursor, { stiffness: 520, damping: 42, mass: 0.6 });

  const alturaUtil = altura - MARGEM.t - MARGEM.b;
  const base = MARGEM.t + alturaUtil;
  const yPx = (n: number) => MARGEM.t + (1 - n) * alturaUtil;
  const exibido = (k: number) => de.current[k] + (para.current[k] - de.current[k]) * t.get();
  const pontos = (w: number) => {
    const util = Math.max(1, w - MARGEM.l - MARGEM.r);
    return Array.from({ length: AMOSTRAS }, (_, k) => [MARGEM.l + (k / (AMOSTRAS - 1)) * util, yPx(exibido(k))] as [number, number]);
  };
  const amostrarY = (fracao: number) => {
    const k = limitar(fracao, 0, 1) * (AMOSTRAS - 1);
    const i = Math.min(Math.floor(k), AMOSTRAS - 2);
    const a = exibido(i);
    return yPx(a + (exibido(i + 1) - a) * (k - i));
  };

  const linha = useTransform([t, larguraMV, versao], () => (larguraMV.get() ? caminhoSuave(pontos(larguraMV.get())) : "M0 0"));
  const area = useTransform([t, larguraMV, versao], () => {
    const w = larguraMV.get();
    if (!w) return "M0 0";
    const p = pontos(w);
    return `${caminhoSuave(p)}L${arredondar(p[AMOSTRAS - 1][0])} ${base}L${arredondar(p[0][0])} ${base}Z`;
  });
  const recorte = useTransform([revelado, larguraMV], ([r, w]: number[]) => (r >= 0.999 ? w : MARGEM.l + Math.max(0, w - MARGEM.l - MARGEM.r) * r));
  const pontaX = useTransform([revelado, larguraMV], ([r, w]: number[]) => MARGEM.l + Math.max(0, w - MARGEM.l - MARGEM.r) * r);
  const pontaY = useTransform([revelado, t, larguraMV, versao], ([r]: number[]) => amostrarY(r));
  const pontaOpacidade = useTransform(revelado, [0, 0.02, 0.96, 1], [0, 1, 1, 0]);
  const marcadorY = useTransform([cursorSuave, t, larguraMV, versao], ([c]: number[]) => amostrarY((c - MARGEM.l) / Math.max(1, larguraMV.get() - MARGEM.l - MARGEM.r)));
  const dicaX = useTransform([cursorSuave, larguraMV], ([c, w]: number[]) => limitar(c - LARGURA_DA_DICA / 2, 0, Math.max(0, w - LARGURA_DA_DICA)));

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = (w: number) => {
      if (w <= 0) return;
      setLargura(w);
      larguraMV.set(w);
      if (comecou.current) return;
      comecou.current = true;
      if (reduzir) revelado.set(1);
      else animate(revelado, 1, { duration: 1.1, ease: IDA_E_VOLTA });
    };
    medir(Math.round(el.getBoundingClientRect().width));
    const observador = new ResizeObserver(([e]) => medir(Math.round(e.contentRect.width)));
    observador.observe(el);
    return () => observador.disconnect();
  }, [larguraMV, revelado, reduzir]);

  useEffect(() => {
    const atual = modelo[periodo];
    if (!atual) return;
    de.current = atual.normalizados;
    para.current = atual.normalizados;
    versao.set(versao.get() + 1);
  }, [modelo, periodo, versao]);

  const m = modelo[periodo];
  if (!m) return null;
  const quantidade = m.pontos.length;

  const trocarPeriodo = (proximo: string) => {
    if (proximo === periodo || !modelo[proximo]) return;
    transicao.current?.stop();
    const e = t.get();
    const atual = new Float64Array(AMOSTRAS);
    for (let k = 0; k < AMOSTRAS; k++) atual[k] = de.current[k] + (para.current[k] - de.current[k]) * e;
    de.current = atual;
    para.current = modelo[proximo].normalizados;
    t.set(0);
    versao.set(versao.get() + 1);
    transicao.current = animate(t, 1, { duration: reduzir ? 0 : 0.55, ease: IDA_E_VOLTA });
    setPeriodo(proximo);
    setSobre(null);
  };

  const irPara = (indice: number) => {
    const util = Math.max(1, largura - MARGEM.l - MARGEM.r);
    const alvo = MARGEM.l + (quantidade > 1 ? indice / (quantidade - 1) : 0.5) * util;
    cursor.set(alvo);
    if (sobre === null) cursorSuave.jump(alvo);
    ultimoSobre.current = indice;
    setSobre(indice);
  };
  const aoMover = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const fracao = limitar((e.clientX - r.left - MARGEM.l) / Math.max(1, largura - MARGEM.l - MARGEM.r), 0, 1);
    irPara(Math.round(fracao * (quantidade - 1)));
  };
  const aoTeclar = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      irPara(limitar((sobre ?? quantidade - 1) + (e.key === "ArrowRight" ? 1 : -1), 0, quantidade - 1));
    } else if (e.key === "Escape") setSobre(null);
  };

  const mostrado = m.pontos[sobre ?? quantidade - 1];
  const pontoDaDica = m.pontos[Math.min(ultimoSobre.current, quantidade - 1)];
  const primeiro = m.pontos[0].valor;
  const variacao = primeiro !== 0 ? (mostrado.valor - primeiro) / Math.abs(primeiro) : null;
  const estreito = largura > 0 && largura < 380;
  const quantasMarcas = estreito ? 3 : largura < 520 ? 4 : 5;
  const marcasX = [...new Set(Array.from({ length: quantasMarcas }, (_, j) => Math.round((j / (quantasMarcas - 1)) * (quantidade - 1))))];

  return (
    <div className="ga">
      <div className="ga-topo">
        <div className="ga-resumo">
          <span className="ga-titulo">{titulo}</span>
          <span className="ga-valor numero privado">{formatarValor(mostrado.valor)}</span>
          <span className="ga-variacao numero" data-sinal={variacao === null ? undefined : variacao >= 0 ? "positivo" : "negativo"}>
            {variacao !== null && <span className="privado">{`${variacao >= 0 ? "+" : ""}${(variacao * 100).toFixed(1).replace(".", ",")}%`}</span>}
            <span className="ga-variacao-quando">{sobre !== null ? formatarDia(mostrado.data) : rotulosDosPeriodos[periodo]}</span>
          </span>
        </div>
        <div role="tablist" aria-label={titulo} className="ga-periodos">
          {chaves.map((k) => (
            <button key={k} role="tab" type="button" aria-selected={k === periodo} className="ga-periodo" onClick={() => trocarPeriodo(k)}>
              {k === periodo && <motion.span layoutId={`${uid}-pilula`} className="ga-pilula" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />}
              <span className="ga-periodo-texto">{rotulosDosPeriodos[k]}</span>
            </button>
          ))}
        </div>
      </div>
      <div ref={caixa} className="ga-area" style={{ height: altura }}>
        {largura > 0 && (
          <>
            <svg width={largura} height={altura} role="img" tabIndex={0} aria-label={descrever(rotulosDosPeriodos[periodo], formatarValor(m.pontos[0].valor), formatarValor(m.pontos[quantidade - 1].valor))} className="ga-svg" onKeyDown={aoTeclar} onBlur={() => setSobre(null)}>
              <defs>
                <linearGradient id={`${uid}-preenchimento`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
                <clipPath id={`${uid}-recorte`}>
                  <motion.rect x={0} y={0} height={altura} width={recorte} />
                </clipPath>
              </defs>
              <AnimatePresence>
                <motion.g key={periodo} className="ga-eixos privado" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: SAIDA }}>
                  {m.marcas.map((v) => {
                    const y = yPx((v - m.baixo) / (m.alto - m.baixo));
                    return (
                      <g key={v}>
                        <line x1={MARGEM.l} x2={largura - MARGEM.r} y1={y} y2={y} className="ga-grade" />
                        <text x={MARGEM.l - 10} y={y} textAnchor="end" dominantBaseline="middle" className="ga-texto-eixo">{formatarCompacto(v)}</text>
                      </g>
                    );
                  })}
                  {marcasX.map((indice, j) => (
                    <text key={indice} x={MARGEM.l + (quantidade > 1 ? indice / (quantidade - 1) : 0.5) * (largura - MARGEM.l - MARGEM.r)} y={altura - 6} textAnchor={j === 0 ? "start" : j === marcasX.length - 1 ? "end" : "middle"} className="ga-texto-eixo">
                      {formatarEixo(m.pontos[indice].data, quantidade)}
                    </text>
                  ))}
                </motion.g>
              </AnimatePresence>
              <g clipPath={`url(#${uid}-recorte)`} className="privado">
                <motion.path d={area} fill={`url(#${uid}-preenchimento)`} />
                <motion.path d={linha} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </g>
              <motion.circle cx={pontaX} cy={pontaY} r={3.5} fill="currentColor" style={{ opacity: pontaOpacidade }} />
              <motion.g initial={false} animate={{ opacity: sobre !== null ? 1 : 0 }} transition={{ duration: 0.15, ease: SAIDA }} pointerEvents="none">
                <motion.line x1={cursorSuave} x2={cursorSuave} y1={MARGEM.t - 6} y2={base} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="3 3" />
                <motion.circle cx={cursorSuave} cy={marcadorY} r={4.5} stroke="currentColor" strokeWidth={2} className="ga-marcador" />
              </motion.g>
              <rect x={0} y={0} width={largura} height={altura} fill="transparent" style={{ touchAction: "pan-y", cursor: "crosshair" }} onPointerMove={aoMover} onPointerDown={aoMover} onPointerLeave={() => setSobre(null)} />
            </svg>
            <motion.div className="ga-dica" style={{ x: dicaX, width: LARGURA_DA_DICA }} initial={false} animate={{ opacity: sobre !== null ? 1 : 0 }} transition={{ duration: 0.15, ease: SAIDA }}>
              <span className="ga-dica-data">{formatarDia(pontoDaDica.data)}</span>
              <span className="ga-dica-valor numero privado">{formatarValor(pontoDaDica.valor)}</span>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

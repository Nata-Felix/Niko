import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

// Adaptado do LiquidToggle do EasyUI (MIT, Suraj Maurya). Licença em licencas/easyui.txt.

const PONTOS = 12;

export function caminhoDaGota(largura: number, altura: number, progresso: number, esticada: number): string {
  const margem = Math.max(2, Math.round(altura * 0.15));
  const raio = (altura - margem * 2) / 2;
  const esquerda = margem + raio;
  const direita = largura - margem - raio;
  const cy = altura / 2;
  const cx = esquerda + (direita - esquerda) * progresso;
  const rx = raio * (1 + esticada * 0.35);
  const ry = raio * (1 - esticada * 0.12);
  const pontos: [number, number][] = [];
  for (let i = 0; i < PONTOS; i++) {
    const angulo = (Math.PI * 2 * i) / PONTOS - Math.PI / 2;
    const ondulacao = 1 + esticada * 0.18 * Math.sin(angulo * 3 + progresso * Math.PI * 2);
    pontos.push([cx + Math.cos(angulo) * rx * ondulacao, cy + Math.sin(angulo) * ry * ondulacao]);
  }
  const meio = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const inicio = meio(pontos[PONTOS - 1], pontos[0]);
  let d = `M ${inicio[0].toFixed(2)} ${inicio[1].toFixed(2)}`;
  for (let i = 0; i < PONTOS; i++) {
    const controle = pontos[i];
    const fim = meio(controle, pontos[(i + 1) % PONTOS]);
    d += ` Q ${controle[0].toFixed(2)} ${controle[1].toFixed(2)} ${fim[0].toFixed(2)} ${fim[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

export function GotaDoAlternador({ ligado }: { ligado: boolean }) {
  const reduzir = useReducedMotion();
  const caixa = useRef<SVGSVGElement>(null);
  const [tamanho, setTamanho] = useState({ largura: 36, altura: 20 });
  const largura = useMotionValue(36);
  const altura = useMotionValue(20);
  const progresso = useMotionValue(ligado ? 1 : 0);
  const mola = useSpring(progresso, reduzir ? { duration: 0 } : { stiffness: 280, damping: 24, mass: 0.55 });
  const esticada = useMotionValue(0);
  const esticadaSuave = useSpring(esticada, { stiffness: 240, damping: 18, mass: 0.4 });

  useLayoutEffect(() => {
    const trilho = caixa.current?.parentElement;
    if (!trilho) return;
    const medir = () => {
      const r = trilho.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      largura.set(r.width);
      altura.set(r.height);
      setTamanho((a) => (a.largura === r.width && a.altura === r.height ? a : { largura: r.width, altura: r.height }));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(trilho);
    return () => observador.disconnect();
  }, [largura, altura]);

  useEffect(() => {
    progresso.set(ligado ? 1 : 0);
  }, [ligado, progresso]);

  useEffect(() => {
    if (reduzir) return;
    let anterior = mola.get();
    return mola.on("change", (atual) => {
      esticada.set(Math.min(1, Math.abs(atual - anterior) * 6));
      anterior = atual;
    });
  }, [mola, esticada, reduzir]);

  const d = useTransform<number, string>([mola, esticadaSuave, largura, altura], ([p, e, l, a]) => caminhoDaGota(l, a, p, reduzir ? 0 : e));

  return (
    <svg ref={caixa} className="alternador-gota" width={tamanho.largura} height={tamanho.altura} viewBox={`0 0 ${tamanho.largura} ${tamanho.altura}`} aria-hidden="true">
      <motion.path d={d} />
    </svg>
  );
}

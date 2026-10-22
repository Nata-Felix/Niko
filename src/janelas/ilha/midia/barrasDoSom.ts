import { useEffect, type RefObject } from "react";

const INTERVALO_DA_LEITURA = 70;
const REPOUSO = 0.14;

async function lerNivelDaSaida(): Promise<number | null> {
  try {
    const r = await fetch("/ponte/midia/nivel", { headers: { "x-niko": "1" } });
    if (!r.ok) return null;
    const dados = (await r.json()) as { nivel?: unknown };
    return typeof dados.nivel === "number" ? dados.nivel : null;
  } catch {
    return null;
  }
}

export function nivelSimulado(segundos: number): number {
  return Math.max(0, Math.min(1, 0.5 + 0.28 * Math.sin(segundos * 2.3) * Math.sin(segundos * 0.7 + 1) + 0.18 * Math.sin(segundos * 9.1)));
}

export function alturaDaBarra(nivel: number, indice: number, segundos: number): number {
  const frequencia = 2.1 + ((indice * 7919) % 13) / 4;
  const fase = (indice * 1.7) % (Math.PI * 2);
  const peso = 0.55 + ((indice * 31) % 10) / 22;
  const forca = Math.min(1, Math.pow(Math.max(0, nivel), 0.6) * 1.15);
  return Math.min(1, REPOUSO + (1 - REPOUSO) * forca * peso * (0.6 + 0.4 * Math.sin(segundos * frequencia + fase)));
}

export function usarBarrasDoSom(caixa: RefObject<HTMLElement | null>, ligado: boolean, quantidade: number, simulado = false) {
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const barras = Array.from(el.children) as HTMLElement[];
    if (!ligado) {
      barras.forEach((b, i) => {
        b.style.transform = `scaleY(${alturaDaBarra(0.32, i, 0).toFixed(3)})`;
      });
      return;
    }
    let alvo = 0;
    let atual = 0;
    let picoRecente = 0.1;
    let quadro = 0;
    let lendo = false;
    let ativo = true;
    const ler = async () => {
      if (lendo || document.hidden) return;
      lendo = true;
      const nivel = await lerNivelDaSaida();
      lendo = false;
      if (nivel == null) return;
      picoRecente = Math.max(nivel, picoRecente * 0.985, 0.04);
      alvo = Math.min(1, nivel / picoRecente);
    };
    const leitura = simulado ? 0 : window.setInterval(ler, INTERVALO_DA_LEITURA);
    const desenhar = (agora: number) => {
      if (!ativo) return;
      const segundos = agora / 1000;
      if (simulado) alvo = nivelSimulado(segundos);
      atual += (alvo - atual) * (alvo > atual ? 0.45 : 0.12);
      barras.forEach((b, i) => {
        b.style.transform = `scaleY(${alturaDaBarra(atual, i, segundos).toFixed(3)})`;
      });
      quadro = requestAnimationFrame(desenhar);
    };
    quadro = requestAnimationFrame(desenhar);
    return () => {
      ativo = false;
      cancelAnimationFrame(quadro);
      window.clearInterval(leitura);
    };
  }, [caixa, ligado, quantidade, simulado]);
}

import { useEffect, useState } from "react";
import { capaDaFaixa, type Faixa } from "../../../estado/midia";

const LIMITE_DO_CACHE = 60;
const cores = new Map<string, string>();

function hsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const canal = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${canal(0)}${canal(8)}${canal(4)}`;
}

export function corPredominante(pixels: Uint8ClampedArray): string | null {
  let soma = 0;
  let x = 0;
  let y = 0;
  let saturacao = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [h, s, l] = hsl(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
    const peso = s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.6) + 0.002;
    const angulo = (h * Math.PI) / 180;
    x += Math.cos(angulo) * peso * s;
    y += Math.sin(angulo) * peso * s;
    saturacao += s * peso;
    soma += peso;
  }
  if (soma === 0) return null;
  const forca = saturacao > 0 ? Math.hypot(x, y) / saturacao : 0;
  const matiz = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const s = forca < 0.08 ? 0 : Math.min(0.85, Math.max(0.45, saturacao / soma));
  return hex(matiz, s, s === 0 ? 0.62 : 0.56);
}

async function extrairCor(url: string): Promise<string | null> {
  try {
    const imagem = new Image();
    imagem.crossOrigin = "anonymous";
    imagem.src = url;
    await imagem.decode();
    const tela = document.createElement("canvas");
    tela.width = 24;
    tela.height = 24;
    const contexto = tela.getContext("2d", { willReadFrequently: true });
    if (!contexto) return null;
    contexto.drawImage(imagem, 0, 0, 24, 24);
    return corPredominante(contexto.getImageData(0, 0, 24, 24).data);
  } catch {
    return null;
  }
}

export function usarCorDaCapa(faixa: Faixa | null): string {
  const reserva = capaDaFaixa(faixa)[0];
  const url = faixa?.capa ?? null;
  const [cor, setCor] = useState(() => (url && cores.get(url)) || reserva);
  useEffect(() => {
    if (!url) {
      setCor(reserva);
      return;
    }
    const pronta = cores.get(url);
    if (pronta) {
      setCor(pronta);
      return;
    }
    let vivo = true;
    void extrairCor(url).then((achada) => {
      if (achada) {
        if (cores.size >= LIMITE_DO_CACHE) cores.delete(cores.keys().next().value!);
        cores.set(url, achada);
      }
      if (vivo) setCor(achada ?? reserva);
    });
    return () => {
      vivo = false;
    };
  }, [url, reserva]);
  return cor;
}

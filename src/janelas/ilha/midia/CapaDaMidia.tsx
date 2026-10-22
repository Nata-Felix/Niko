import type { CSSProperties } from "react";
import { Music } from "lucide-react";
import { capaDaFaixa, type Faixa } from "../../../estado/midia";
import { Marca, marcaDoApp } from "../../../marcas/Marca";
import { usarCorDaCapa } from "./corDaCapa";

interface Props {
  faixa: Faixa | null;
  tamanho: number;
  raio?: number;
  redonda?: boolean;
  sombra?: boolean;
  className?: string;
}

export function fundoGeradoDaCapa(faixa: Faixa | null): string {
  const [c1, c2] = capaDaFaixa(faixa);
  return `radial-gradient(120% 120% at 25% 15%, ${c1} 0%, ${c2} 70%, #0b0b0e 120%)`;
}

export function CapaDaMidia({ faixa, tamanho, raio = Math.round(tamanho * 0.18), redonda, sombra, className = "" }: Props) {
  const c1 = usarCorDaCapa(faixa);
  const estilo: CSSProperties = {
    width: tamanho,
    height: tamanho,
    borderRadius: redonda ? "50%" : raio,
    boxShadow: sombra ? `0 8px 24px ${c1}55` : undefined,
  };
  if (faixa?.capa) return <span className={`midia-capa ${className}`} style={{ ...estilo, backgroundImage: `url("${faixa.capa}")` }} />;
  const marca = faixa ? marcaDoApp(faixa.app) : null;
  const icone = Math.max(9, Math.round(tamanho * 0.4));
  return (
    <span className={`midia-capa midia-capa-gerada ${className}`} style={{ ...estilo, background: fundoGeradoDaCapa(faixa) }}>
      {tamanho >= 20 && (marca ? <Marca marca={marca} tamanho={icone} monocromatica /> : <Music size={icone} strokeWidth={1.75} />)}
    </span>
  );
}

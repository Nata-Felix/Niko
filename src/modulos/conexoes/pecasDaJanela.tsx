import type { ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Vazio } from "../../componentes/basicos";
import { Paginacao, usarPaginacao } from "../../componentes/Paginacao";
import { contem } from "../../utilitarios/basicos";
import { T } from "../../textos/textos";

const E = T.janelaConexao.estados as Record<string, string>;

export interface Coluna<L> {
  titulo: string;
  render: (linha: L) => ReactNode;
  texto?: (linha: L) => string;
  direita?: boolean;
}

export function Tabela<L>({ linhas, colunas, filtro, aoAbrir }: { linhas: L[]; colunas: Coluna<L>[]; filtro: string; aoAbrir?: (linha: L) => void }) {
  const filtradas = filtro ? linhas.filter((l) => colunas.some((c) => (c.texto ? contem(c.texto(l), filtro) : false))) : linhas;
  const paginas = usarPaginacao(filtradas, 15, `${filtro}|${linhas.length}`);
  if (filtradas.length === 0) return <Vazio titulo={T.janelaConexao.semResultados} />;
  return (
    <>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c.titulo} className={c.direita ? "direita" : undefined}>{c.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginas.visiveis.map((l, i) => (
              <tr key={i} data-clicavel={aoAbrir ? "sim" : undefined} onClick={aoAbrir ? () => aoAbrir(l) : undefined}>
                {colunas.map((c) => (
                  <td key={c.titulo} className={c.direita ? "direita numero" : undefined}>{c.render(l)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao {...paginas} />
    </>
  );
}

export function Estado({ valor }: { valor: string }) {
  const tom = ["pago", "sucesso", "pronto", "entregue", "aberto", "confirmado", "aprovado"].includes(valor)
    ? "sucesso"
    : ["falhou", "erro", "devolvido", "spam", "cancelado"].includes(valor)
      ? "erro"
      : ["rodando", "construindo", "a_caminho", "pendente", "mudancas", "reembolsado", "revisar"].includes(valor)
        ? "alerta"
        : "";
  return <span className={`etiqueta ${tom ? `etiqueta-${tom}` : ""}`}>{E[valor] ?? valor}</span>;
}

export function Metrica({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="conexao-metrica">
      <span className="numero-grande privado">{valor}</span>
      <span className="conexao-metrica-rotulo">{rotulo}</span>
    </div>
  );
}

export const dataCurta = (iso: string) => format(new Date(iso), "d MMM, HH:mm", { locale: ptBR });

export function Curva({ pontos, largura = 96, altura = 26 }: { pontos: number[]; largura?: number; altura?: number }) {
  if (pontos.length < 2) return null;
  const minimo = Math.min(...pontos);
  const maximo = Math.max(...pontos);
  const faixa = maximo - minimo || 1;
  const caminho = pontos.map((p, i) => `${((i / (pontos.length - 1)) * largura).toFixed(1)},${(altura - 2 - ((p - minimo) / faixa) * (altura - 4)).toFixed(1)}`).join(" ");
  const subiu = pontos[pontos.length - 1] >= pontos[0];
  return (
    <svg className="conexao-curva" data-subiu={subiu ? "sim" : "nao"} width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true">
      <polyline points={caminho} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

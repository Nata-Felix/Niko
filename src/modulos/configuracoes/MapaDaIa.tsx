import { useConfig } from "../../estado/configuracoes";
import { useComunicacao } from "../../estado/comunicacao";
import { T } from "../../textos/textos";
import { FUNCOES, PARTES, funcaoLigada, type Funcao } from "../../utilitarios/funcoes";
import { areasDoBancoDaIa, mapaDasFerramentas, type FerramentaNoMapa } from "../../utilitarios/ferramentasIa";
import type { AgenteId } from "../../tipos";
import { GrupoAjuste } from "./LinhaAjuste";

const M = T.configuracoes.mapaIa;

// Quem assina os cartões de cada área nas ferramentas; as do grupo geral variam por ferramenta.
const DONO: Record<Funcao, AgenteId> = { journal: "organizador", calendario: "organizador", metas: "organizador", estudos: "tutor", financas: "operador" };

interface Grupo {
  id: Funcao | "geral";
  nome: string;
  ligada: boolean;
  dono: string;
  ferramentas: FerramentaNoMapa[];
  areas: string[];
  cartoes: string[];
}

function Pilulas({ itens }: { itens: { nome: string; titulo?: string; apagado?: boolean }[] }) {
  if (itens.length === 0) return <span className="mapa-ia-nada">{M.nada}</span>;
  return (
    <span className="mapa-ia-pilulas">
      {itens.map((i) => (
        <span key={i.nome} className="pilula mono mapa-ia-pilula" title={i.titulo} data-apagado={i.apagado ? "sim" : undefined}>{i.nome}</span>
      ))}
    </span>
  );
}

export function MapaDaIa() {
  const nomes = useConfig((s) => s.agentes.nomes);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  // mapaDasFerramentas lê o estado direto; assinar estes campos redesenha o mapa quando eles mudam.
  useConfig((s) => s.nuncaFinanceiro);
  useComunicacao((s) => s.conexoes);
  const ferramentas = mapaDasFerramentas();
  const areas = areasDoBancoDaIa();
  const daFuncao = (f: Funcao) => new Set(PARTES[f].ferramentasIa);
  const semFuncao = (nome: string) => !FUNCOES.some((f) => PARTES[f].ferramentasIa.includes(nome));

  const grupos: Grupo[] = [
    ...FUNCOES.map((f): Grupo => ({
      id: f,
      nome: T.rotas[PARTES[f].rota],
      ligada: funcaoLigada(f, desligadas),
      dono: nomes[DONO[f]],
      ferramentas: ferramentas.filter((x) => daFuncao(f).has(x.nome)),
      areas: PARTES[f].areasDoBanco,
      cartoes: PARTES[f].cartoes,
    })),
    {
      id: "geral",
      nome: M.geral,
      ligada: true,
      dono: M.todos,
      ferramentas: ferramentas.filter((x) => semFuncao(x.nome)),
      areas: areas.filter((a) => !FUNCOES.some((f) => PARTES[f].areasDoBanco.includes(a))),
      cartoes: [],
    },
  ];
  const disponiveis = ferramentas.filter((f) => f.disponivel);

  return (
    <>
      <GrupoAjuste titulo={M.titulo} dica={M.dica} />
      <div className="ajuste-bloco">
        <p className="mapa-ia-resumo">{M.resumo(disponiveis.length, disponiveis.filter((f) => f.tipo === "acao").length, areas.length)}</p>
        {grupos.map((g) => (
          <section key={g.id} className="mapa-ia-grupo" data-desligada={g.ligada ? undefined : "sim"} aria-label={g.nome}>
            <header className="mapa-ia-cabecalho">
              <b>{g.nome}</b>
              <span className="mapa-ia-dono">{`${M.dono}: ${g.dono}`}</span>
              {!g.ligada && <span className="etiqueta">{M.desligada}</span>}
            </header>
            <dl className="mapa-ia-linhas">
              <dt>{M.consulta}</dt>
              <dd><Pilulas itens={g.ferramentas.filter((f) => f.tipo === "leitura").map((f) => ({ nome: f.nome, titulo: f.descricao, apagado: !f.disponivel }))} /></dd>
              <dt>{M.acoes}</dt>
              <dd><Pilulas itens={g.ferramentas.filter((f) => f.tipo === "acao").map((f) => ({ nome: f.nome, titulo: f.descricao, apagado: !f.disponivel }))} /></dd>
              <dt>{M.banco}</dt>
              <dd><Pilulas itens={g.areas.map((a) => ({ nome: a, apagado: !g.ligada }))} /></dd>
              {g.cartoes.length > 0 && (
                <>
                  <dt>{M.cartoes}</dt>
                  <dd><Pilulas itens={g.cartoes.map((c) => ({ nome: c, apagado: !g.ligada }))} /></dd>
                </>
              )}
            </dl>
          </section>
        ))}
      </div>
      <GrupoAjuste titulo={M.proximosTitulo} dica={M.proximosDica} />
      <div className="ajuste-bloco">
        <ol className="mapa-ia-proximos">
          {M.proximos.map((p) => (
            <li key={p.titulo}>
              <b>{p.titulo}</b>
              <span>{p.detalhe}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

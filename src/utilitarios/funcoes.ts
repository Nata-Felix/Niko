import { useConfig, type AbaIlha, type BlocoInicio, type SecaoHoje } from "../estado/configuracoes";
import type { CartaoConfirmacao, Rota } from "../tipos";
import { T } from "../textos/textos";

export const FUNCOES = ["journal", "estudos", "financas", "metas", "calendario"] as const;
export type Funcao = (typeof FUNCOES)[number];

interface PartesDaFuncao {
  rota: Rota;
  abasDaIlha: AbaIlha[];
  secoesDoHoje: SecaoHoje[];
  blocosDoInicio: BlocoInicio[];
  ferramentasIa: string[];
  areasDoBanco: string[];
  comandos: string[];
  cartoes: CartaoConfirmacao["tipo"][];
}

export const PARTES: Record<Funcao, PartesDaFuncao> = {
  journal: {
    rota: "journal",
    abasDaIlha: [],
    secoesDoHoje: ["tarefas", "habitos"],
    blocosDoInicio: ["hoje"],
    ferramentasIa: ["ler_tarefas", "criar_tarefa", "concluir_tarefa", "ler_habitos", "marcar_habito", "criar_habito", "adicionar_compras"],
    areasDoBanco: ["tarefas", "habitos", "registros_habitos", "journal", "listas_compras"],
    comandos: ["tarefa", "concluir", "habito", "compra"],
    cartoes: ["tarefa", "concluir", "habito", "novoHabito", "compra"],
  },
  estudos: {
    rota: "estudos",
    abasDaIlha: [],
    secoesDoHoje: [],
    blocosDoInicio: ["revisoes"],
    ferramentasIa: ["ler_estudos", "listar_arquivos", "ler_arquivo", "marcar_estudada", "criar_cartao_revisao", "criar_data_estudo"],
    areasDoBanco: ["areas_estudo", "materias", "paginas", "cartoes", "datas_estudo", "links", "revisoes_conteudo"],
    comandos: ["revisar", "link"],
    cartoes: ["estudada", "cartaoEstudo", "dataEstudo"],
  },
  financas: {
    rota: "financas",
    abasDaIlha: [],
    secoesDoHoje: [],
    blocosDoInicio: ["financas"],
    ferramentasIa: ["ler_financas", "lancar_transacao"],
    areasDoBanco: ["contas", "transacoes", "categorias", "recorrentes", "metas_economia", "divisoes"],
    comandos: ["gasto", "receita", "dividir"],
    cartoes: ["gasto", "receita", "dividir"],
  },
  metas: {
    rota: "metas",
    abasDaIlha: [],
    secoesDoHoje: [],
    blocosDoInicio: [],
    ferramentasIa: ["ler_metas", "atualizar_meta"],
    areasDoBanco: ["metas", "pilares", "visao"],
    comandos: [],
    cartoes: ["progressoMeta"],
  },
  calendario: {
    rota: "calendario",
    abasDaIlha: [],
    secoesDoHoje: ["agenda"],
    blocosDoInicio: [],
    ferramentasIa: ["ler_agenda", "criar_evento", "criar_lembrete", "concluir_evento"],
    areasDoBanco: ["eventos"],
    comandos: ["lembrete", "evento"],
    cartoes: ["lembrete", "evento", "eventoFeito"],
  },
};

export function funcoesDesligadas(): Funcao[] {
  return useConfig.getState().funcoesDesligadas;
}

export function funcaoLigada(funcao: Funcao, desligadas: readonly Funcao[] = funcoesDesligadas()): boolean {
  return !desligadas.includes(funcao);
}

function desligadaQueContem<K extends keyof PartesDaFuncao>(parte: K, valor: PartesDaFuncao[K][number], desligadas: readonly Funcao[]): Funcao | null {
  return desligadas.find((f) => (PARTES[f][parte] as readonly unknown[]).includes(valor)) ?? null;
}

export function rotaLigada(rota: Rota, desligadas: readonly Funcao[] = funcoesDesligadas()): boolean {
  return !desligadas.some((f) => PARTES[f].rota === rota);
}

export const SECOES_DO_HOJE: SecaoHoje[] = ["agenda", "tarefas", "habitos"];

export function secoesDoHojeLigadas(desligadas: readonly Funcao[] = funcoesDesligadas()): SecaoHoje[] {
  return SECOES_DO_HOJE.filter((s) => !desligadaQueContem("secoesDoHoje", s, desligadas));
}

export function abaLigada(aba: AbaIlha, desligadas: readonly Funcao[] = funcoesDesligadas()): boolean {
  if (aba === "hoje") return secoesDoHojeLigadas(desligadas).length > 0;
  return !desligadaQueContem("abasDaIlha", aba, desligadas);
}

export function blocoLigado(bloco: BlocoInicio, desligadas: readonly Funcao[] = funcoesDesligadas()): boolean {
  return !desligadaQueContem("blocosDoInicio", bloco, desligadas);
}

export function ferramentaLigada(nome: string, desligadas: readonly Funcao[] = funcoesDesligadas()): boolean {
  return !desligadaQueContem("ferramentasIa", nome, desligadas);
}

export function areaDoBancoLigada(area: string, desligadas: readonly Funcao[] = funcoesDesligadas()): boolean {
  return !desligadaQueContem("areasDoBanco", area, desligadas);
}

export function funcaoDoComando(comando: string, desligadas: readonly Funcao[] = funcoesDesligadas()): Funcao | null {
  return desligadaQueContem("comandos", comando, desligadas);
}

export function comandoDisponivel(linha: string, desligadas: readonly Funcao[] = funcoesDesligadas()): boolean {
  const nome = /^\/(\w+)/.exec(linha.trim())?.[1]?.toLowerCase();
  return !nome || !funcaoDoComando(nome, desligadas);
}

const FUNCAO_DA_CONQUISTA: Record<string, Funcao> = {
  sequencia_habito: "journal",
  revisor: "estudos",
  prova_vencida: "estudos",
  orcamento_em_dia: "financas",
  meta_economia: "financas",
  sem_pendencias: "financas",
  meta_vida: "metas",
};

export function conquistaLigada(codigo: string, desligadas: readonly Funcao[] = funcoesDesligadas()): boolean {
  const funcao = FUNCAO_DA_CONQUISTA[codigo];
  return !funcao || funcaoLigada(funcao, desligadas);
}

export function funcaoDoCartao(tipo: CartaoConfirmacao["tipo"], desligadas: readonly Funcao[] = funcoesDesligadas()): Funcao | null {
  return desligadaQueContem("cartoes", tipo, desligadas);
}

export function avisoDeFuncaoDesligada(funcao: Funcao): string {
  return T.funcoes.desligadaResposta(T.funcoes.nomes[funcao]);
}

export function regraDasFuncoesParaIa(): string | null {
  const desligadas = funcoesDesligadas();
  if (desligadas.length === 0) return null;
  return T.funcoes.regraIa(desligadas.map((f) => T.funcoes.nomes[f]).join(", "));
}

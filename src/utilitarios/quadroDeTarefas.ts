import type { Prioridade, Tarefa } from "../tipos";

export const COLUNAS_DO_QUADRO = ["a_fazer", "em_andamento", "concluida"] as const;
export type ColunaDoQuadro = (typeof COLUNAS_DO_QUADRO)[number];

const PESO_DA_PRIORIDADE: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };

// Reagendada e em aguardo ainda são pendências, então ficam em "A fazer".
export function colunaDaTarefa(t: Pick<Tarefa, "status">): ColunaDoQuadro {
  return t.status === "em_andamento" || t.status === "concluida" ? t.status : "a_fazer";
}

export function colunaVizinha(coluna: ColunaDoQuadro, passo: 1 | -1): ColunaDoQuadro | null {
  return COLUNAS_DO_QUADRO[COLUNAS_DO_QUADRO.indexOf(coluna) + passo] ?? null;
}

export interface DetalhesDoCartao {
  hora?: string;
  data?: string;
  atrasada: boolean;
  prioridade: Prioridade;
  checklist: { feitos: number; total: number } | null;
  pomodoros?: number;
  meta?: string;
  materia?: string;
}

export function tarefaAtrasada(t: Pick<Tarefa, "status" | "data" | "hora">, hoje: string, agoraHHMM: string): boolean {
  if (colunaDaTarefa(t) === "concluida" || t.status === "cancelada" || !t.data) return false;
  if (t.data < hoje) return true;
  return t.data === hoje && Boolean(t.hora) && (t.hora as string) < agoraHHMM;
}

export function detalhesDoCartao(
  t: Tarefa,
  contexto: { metas: { id: string; nome: string }[]; materias: { id: string; nome: string }[]; hoje: string; agoraHHMM: string; mostrarData?: boolean },
): DetalhesDoCartao {
  const feitos = t.checklist.filter((i) => i.feito).length;
  return {
    hora: t.hora,
    data: contexto.mostrarData && t.data && t.data !== contexto.hoje ? t.data : undefined,
    atrasada: tarefaAtrasada(t, contexto.hoje, contexto.agoraHHMM),
    prioridade: t.prioridade,
    checklist: t.checklist.length ? { feitos, total: t.checklist.length } : null,
    pomodoros: t.estimativaPomodoros && t.estimativaPomodoros > 0 ? t.estimativaPomodoros : undefined,
    meta: t.metaId ? contexto.metas.find((m) => m.id === t.metaId)?.nome : undefined,
    materia: t.materiaId ? contexto.materias.find((m) => m.id === t.materiaId)?.nome : undefined,
  };
}

export function ordenarCartoes(lista: Tarefa[], coluna: ColunaDoQuadro): Tarefa[] {
  if (coluna === "concluida") return [...lista].sort((a, b) => (b.concluidaEm ?? "").localeCompare(a.concluidaEm ?? ""));
  return [...lista].sort((a, b) => PESO_DA_PRIORIDADE[a.prioridade] - PESO_DA_PRIORIDADE[b.prioridade] || (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99") || a.titulo.localeCompare(b.titulo));
}

export function progressoDoQuadro(lista: Pick<Tarefa, "status">[]): { feitas: number; total: number } {
  const validas = lista.filter((t) => t.status !== "cancelada");
  return { feitas: validas.filter((t) => colunaDaTarefa(t) === "concluida").length, total: validas.length };
}

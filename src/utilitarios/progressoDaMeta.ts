import { addDays } from "date-fns";
import { useRotina, habitoCumprido } from "../estado/rotina";
import { usePomodoro } from "../estado/pomodoro";
import { useFinancas } from "../estado/financas";
import { useOrganizacao } from "../estado/organizacao";
import { deISO, paraISO } from "./datas";
import { somar } from "./basicos";
import { ocorrencias } from "./itensDoCalendario";
import type { Evento, Meta } from "../tipos";

export interface DadosDoProgresso {
  eventos?: Evento[];
  tarefas: ReturnType<typeof useRotina.getState>["tarefas"];
  habitos: ReturnType<typeof useRotina.getState>["habitos"];
  registros: ReturnType<typeof useRotina.getState>["registros"];
  sessoes: ReturnType<typeof usePomodoro.getState>["sessoes"];
  economias: ReturnType<typeof useFinancas.getState>["metasEconomia"];
}

export interface ProgressoDaMeta {
  atual: number;
  alvo: number;
  rotulo: string;
}

// Ocorrências de eventos contam da criação da meta até o prazo ou o fim do período, sem contagem retroativa.
export function janelaDaMeta(m: Meta, hoje = new Date()): { inicio: string; fim: string } {
  const inicio = m.historico[0]?.data ?? paraISO(hoje);
  const fim = m.prazo ?? paraISO(addDays(deISO(inicio), (m.periodo === "ano" ? 365 : 90) - 1));
  return { inicio, fim };
}

export function progressoDaMeta(m: Meta, dados: DadosDoProgresso, hoje = new Date()): ProgressoDaMeta {
  switch (m.tipo) {
    case "habito": {
      const h = dados.habitos.find((x) => x.id === m.vinculoId);
      if (!h) return { atual: 0, alvo: 100, rotulo: "0%" };
      const dias = Array.from({ length: m.periodo === "ano" ? 365 : 90 }, (_, i) => paraISO(addDays(hoje, -i)));
      const pct = Math.round((dias.filter((d) => habitoCumprido(h, dados.registros[d]?.[h.id])).length / dias.length) * 100);
      return { atual: pct, alvo: m.alvo, rotulo: `${pct}%` };
    }
    case "estudo": {
      const horas = somar(dados.sessoes.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && s.materiaId === m.vinculoId), (s) => s.minutos) / 60;
      return { atual: horas, alvo: m.alvo, rotulo: `${horas.toFixed(1).replace(".", ",")} / ${m.alvo} h` };
    }
    case "financeira": {
      const e = dados.economias.find((x) => x.id === m.vinculoId) ?? dados.economias[0];
      if (!e) return { atual: 0, alvo: 100, rotulo: "0%" };
      const pct = e.alvo ? Math.round((e.guardado / e.alvo) * 100) : 0;
      return { atual: pct, alvo: 100, rotulo: `${pct}%` };
    }
    case "tarefas": {
      const ligadas = dados.tarefas.filter((t) => t.metaId === m.id);
      let feitas = ligadas.filter((t) => t.status === "concluida").length;
      let total = ligadas.length;
      const eventos = (dados.eventos ?? []).filter((e) => e.metaId === m.id);
      if (eventos.length > 0) {
        const { inicio, fim } = janelaDaMeta(m, hoje);
        for (const e of eventos) {
          const datas = ocorrencias(e, inicio, fim);
          const feitos = new Set(e.feitos ?? []);
          total += datas.length;
          feitas += datas.filter((d) => feitos.has(d)).length;
        }
      }
      return { atual: feitas, alvo: Math.max(1, total), rotulo: `${feitas} / ${total}` };
    }
    default:
      return { atual: m.atual, alvo: m.alvo, rotulo: `${m.atual} / ${m.alvo}` };
  }
}

export function dadosAtuaisDoProgresso(): DadosDoProgresso {
  const rotina = useRotina.getState();
  return { eventos: useOrganizacao.getState().eventos, tarefas: rotina.tarefas, habitos: rotina.habitos, registros: rotina.registros, sessoes: usePomodoro.getState().sessoes, economias: useFinancas.getState().metasEconomia };
}

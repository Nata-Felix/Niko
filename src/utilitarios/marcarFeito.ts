import { useOrganizacao } from "../estado/organizacao";
import { useRotina } from "../estado/rotina";
import { useEstudos } from "../estado/estudos";
import type { ItemDoCalendario } from "./itensDoCalendario";

export function marcarItemFeito(i: ItemDoCalendario, feito: boolean) {
  if (i.evento) useOrganizacao.getState().marcarEventoFeito(i.evento.id, i.data, feito);
  else if (i.tarefa) useRotina.getState().mudarStatus(i.tarefa.id, feito ? "concluida" : "a_fazer");
  else if (i.revisao) { if (feito) useEstudos.getState().concluirRevisaoConteudo(i.revisao.id); }
  else if (i.habito) useRotina.getState().registrarHabito(i.data, i.habito.id, feito ? (i.habito.tipo === "sim_nao" ? 1 : i.habito.meta) : 0);
}

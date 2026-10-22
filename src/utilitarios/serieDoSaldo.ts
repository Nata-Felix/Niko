import { addDays, format } from "date-fns";
import { saldoDaContaEmReais } from "../estado/financas";
import type { Conta, Transacao } from "../tipos";
import type { PontoDoGrafico } from "../componentes/GraficoDeArea";

type DadosDoSaldo = Parameters<typeof saldoDaContaEmReais>[0] & { contas: Conta[]; transacoes: Transacao[] };

export const PERIODOS_DO_SALDO = { "7d": { dias: 7, passo: 1 }, "30d": { dias: 30, passo: 1 }, "12m": { dias: 364, passo: 7 } } as const;
export type PeriodoDoSaldo = keyof typeof PERIODOS_DO_SALDO;

export function serieDoSaldo(dados: DadosDoSaldo, hoje: Date, dias: number, passo: number): PontoDoGrafico[] {
  const ativas = dados.contas.filter((c) => !c.arquivada);
  const pontos: PontoDoGrafico[] = [];
  const saldoAte = (ate?: string) => ativas.reduce((soma, c) => soma + saldoDaContaEmReais(dados, c.id, ate), 0);
  for (let atras = dias - 1; atras > 0; atras -= passo) {
    const dia = addDays(hoje, -atras);
    pontos.push({ data: dia.getTime(), valor: saldoAte(format(dia, "yyyy-MM-dd")) });
  }
  pontos.push({ data: hoje.getTime(), valor: saldoAte() });
  return pontos;
}

export function seriesDoSaldo(dados: DadosDoSaldo, hoje: Date): Record<PeriodoDoSaldo, PontoDoGrafico[]> {
  return {
    "7d": serieDoSaldo(dados, hoje, PERIODOS_DO_SALDO["7d"].dias, PERIODOS_DO_SALDO["7d"].passo),
    "30d": serieDoSaldo(dados, hoje, PERIODOS_DO_SALDO["30d"].dias, PERIODOS_DO_SALDO["30d"].passo),
    "12m": serieDoSaldo(dados, hoje, PERIODOS_DO_SALDO["12m"].dias, PERIODOS_DO_SALDO["12m"].passo),
  };
}

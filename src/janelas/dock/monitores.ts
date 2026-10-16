import type { MonitorDoNiko } from "../../desktop/desktop";
import { T } from "../../textos/textos";

export const TODOS_OS_MONITORES = "todos";

export function escolhaDoDock(salva: string | undefined, lista: MonitorDoNiko[]): string {
  const escolha = salva ?? TODOS_OS_MONITORES;
  if (escolha === TODOS_OS_MONITORES || lista.some((m) => m.nome === escolha)) return escolha;
  return lista.find((m) => m.principal)?.nome ?? TODOS_OS_MONITORES;
}

export function opcoesDeMonitorDoDock(lista: MonitorDoNiko[]): { valor: string; rotulo: string }[] {
  const M = T.ilha.barra.personalizacao.monitores;
  return [
    { valor: TODOS_OS_MONITORES, rotulo: lista.length === 2 ? M.osDois : M.todos },
    ...lista.map((m) => ({ valor: m.nome, rotulo: lista.length === 2 ? (m.principal ? M.principal : M.secundario) : M.numero(m.numero, m.principal) })),
  ];
}

export function meuMonitor(lista: MonitorDoNiko[], rotulo: string | null): MonitorDoNiko | undefined {
  return lista.find((m) => m.rotulo === rotulo);
}

export function dockAtivoNoMonitor(escolha: string, meu: MonitorDoNiko | undefined, lista: MonitorDoNiko[], rotulo: string | null): boolean {
  if (lista.length < 2) return meu ? meu.principal : rotulo === null || rotulo === "dock";
  if (!meu) return false;
  if (escolha === TODOS_OS_MONITORES) return true;
  if (lista.some((m) => m.nome === escolha)) return meu.nome === escolha;
  return meu.principal;
}

function centroNoMonitor(centro: { x: number; y: number }, monitor: MonitorDoNiko): boolean {
  const x = monitor.x ?? 0;
  const y = monitor.y ?? 0;
  return centro.x >= x && centro.x < x + monitor.largura && centro.y >= y && centro.y < y + monitor.altura;
}

export function appsDoMonitor<T extends { monitor?: string; centro?: { x: number; y: number } }>(apps: T[], monitor?: MonitorDoNiko): T[] {
  if (!monitor) return apps;
  if (apps.some((a) => a.monitor !== undefined)) return apps.filter((a) => a.monitor === monitor.nome);
  if (monitor.x === undefined || monitor.y === undefined || !apps.some((a) => a.centro)) return apps;
  return apps.filter((a) => !a.centro || centroNoMonitor(a.centro, monitor));
}

export function cadaDockMostraSeusApps(escolha: string, lista: MonitorDoNiko[], appsDeTodosOsMonitores = false): boolean {
  return lista.length >= 2 && escolha === TODOS_OS_MONITORES && !appsDeTodosOsMonitores;
}

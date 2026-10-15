export const SONO_MAXIMO = 16;

function minutosDoHorario(horario: string): number | null {
  const partes = /^(\d{1,2}):(\d{2})$/.exec(horario);
  if (!partes) return null;
  const horas = Number(partes[1]);
  const minutos = Number(partes[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
}

export function horasDeSono(dormiu?: string, acordou?: string): number | null {
  if (!dormiu || !acordou) return null;
  const inicio = minutosDoHorario(dormiu);
  const fim = minutosDoHorario(acordou);
  if (inicio === null || fim === null) return null;
  const duracao = (fim - inicio + 24 * 60) % (24 * 60);
  if (duracao === 0) return null;
  return Math.min(SONO_MAXIMO, Math.round((duracao / 60) * 10) / 10);
}

export function sonoAoMudarHorario(dia: { dormiu?: string; acordou?: string; sono?: number }, mudanca: { dormiu?: string; acordou?: string }): { dormiu?: string; acordou?: string; sono?: number } {
  const proximo = { ...dia, ...mudanca };
  const calculado = horasDeSono(proximo.dormiu, proximo.acordou);
  return calculado === null ? mudanca : { ...mudanca, sono: calculado };
}

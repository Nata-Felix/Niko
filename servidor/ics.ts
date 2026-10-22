export interface EventoIcs {
  id: string;
  titulo: string;
  inicio: string;
  fim: string | null;
  diaInteiro: boolean;
  local: string;
  agenda: string;
}

interface Propriedade {
  valor: string;
  parametros: Record<string, string>;
}

type Componente = Map<string, Propriedade[]>;

const MAXIMO_DE_OCORRENCIAS = 2000;

export function desdobrarLinhas(texto: string): string[] {
  return texto.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function lerPropriedade(linha: string): [string, Propriedade] | null {
  const doisPontos = linha.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (doisPontos < 0) return null;
  const [nome, ...parametros] = linha.slice(0, doisPontos).split(";");
  const mapa: Record<string, string> = {};
  for (const p of parametros) {
    const [k, v] = p.split("=");
    if (k && v !== undefined) mapa[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return [nome.toUpperCase(), { valor: linha.slice(doisPontos + 1), parametros: mapa }];
}

export function componentes(texto: string, tipo = "VEVENT"): Componente[] {
  const lista: Componente[] = [];
  let atual: Componente | null = null;
  let profundidade = 0;
  for (const linha of desdobrarLinhas(texto)) {
    if (linha === `BEGIN:${tipo}`) {
      atual = new Map();
      profundidade = 0;
      continue;
    }
    if (!atual) continue;
    if (linha.startsWith("BEGIN:")) profundidade++;
    else if (linha.startsWith("END:") && profundidade > 0) profundidade--;
    else if (linha === `END:${tipo}`) {
      lista.push(atual);
      atual = null;
    } else if (profundidade === 0) {
      const p = lerPropriedade(linha);
      if (p) atual.set(p[0], [...(atual.get(p[0]) ?? []), p[1]]);
    }
  }
  return lista;
}

export function textoIcs(valor: string): string {
  return valor.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

function deslocamentoDoFuso(fuso: string, instante: Date): number | null {
  try {
    const partes = new Intl.DateTimeFormat("en-US", { timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(instante);
    const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
    return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - instante.getTime();
  } catch {
    return null;
  }
}

export function dataIcs(p: Propriedade): { data: Date; diaInteiro: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(p.valor.trim());
  if (!m) return null;
  const [, a, me, d, h, mi, s, z] = m;
  if (!h) return { data: new Date(Number(a), Number(me) - 1, Number(d)), diaInteiro: true };
  const utc = Date.UTC(Number(a), Number(me) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (z) return { data: new Date(utc), diaInteiro: false };
  const fuso = p.parametros.TZID;
  const deslocamento = fuso ? deslocamentoDoFuso(fuso, new Date(utc)) : null;
  if (deslocamento === null) return { data: new Date(Number(a), Number(me) - 1, Number(d), Number(h), Number(mi), Number(s)), diaInteiro: false };
  return { data: new Date(utc - deslocamento), diaInteiro: false };
}

const DIAS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function regraDeRepeticao(valor: string) {
  const r = Object.fromEntries(valor.split(";").map((par) => par.split("=") as [string, string]));
  const ate = r.UNTIL ? dataIcs({ valor: r.UNTIL, parametros: {} })?.data ?? null : null;
  return {
    frequencia: r.FREQ as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | undefined,
    intervalo: Math.max(1, Number(r.INTERVAL) || 1),
    vezes: r.COUNT ? Number(r.COUNT) : null,
    ate,
    diasDaSemana: r.BYDAY ? r.BYDAY.split(",").map((d) => DIAS[d.slice(-2)]).filter((d) => d !== undefined) : [],
  };
}

export function ocorrenciasDoEvento(inicio: Date, regra: string | null, de: Date, ate: Date, excecoes: Set<number>): Date[] {
  if (!regra) return inicio >= de && inicio <= ate ? [inicio] : [];
  const r = regraDeRepeticao(regra);
  if (!r.frequencia) return inicio >= de && inicio <= ate ? [inicio] : [];
  const resultado: Date[] = [];
  let contadas = 0;
  const aceitar = (d: Date) => {
    if (r.ate && d > r.ate) return false;
    if (r.vezes !== null && contadas >= r.vezes) return false;
    contadas++;
    if (d >= de && d <= ate && !excecoes.has(d.getTime())) resultado.push(d);
    return true;
  };
  for (let passo = 0, base = new Date(inicio); passo < MAXIMO_DE_OCORRENCIAS && base <= ate; passo++) {
    if (r.frequencia === "WEEKLY" && r.diasDaSemana.length) {
      const domingo = new Date(base);
      domingo.setDate(base.getDate() - base.getDay());
      for (const dia of [...r.diasDaSemana].sort()) {
        const d = new Date(domingo);
        d.setDate(domingo.getDate() + dia);
        if (d < inicio) continue;
        if (!aceitar(d)) return resultado;
      }
      base = new Date(base);
      base.setDate(base.getDate() + 7 * r.intervalo);
      continue;
    }
    if (!aceitar(new Date(base))) return resultado;
    base = new Date(base);
    if (r.frequencia === "DAILY") base.setDate(base.getDate() + r.intervalo);
    else if (r.frequencia === "WEEKLY") base.setDate(base.getDate() + 7 * r.intervalo);
    else if (r.frequencia === "MONTHLY") base.setMonth(base.getMonth() + r.intervalo);
    else base.setFullYear(base.getFullYear() + r.intervalo);
  }
  return resultado;
}

export function eventosDoIcs(texto: string, agenda: string, de: Date, ate: Date): EventoIcs[] {
  const eventos = componentes(texto);
  const substituidos = new Map<string, Set<number>>();
  for (const e of eventos) {
    const uid = e.get("UID")?.[0]?.valor;
    const recorrencia = e.get("RECURRENCE-ID")?.[0];
    const data = recorrencia ? dataIcs(recorrencia) : null;
    if (uid && data) substituidos.set(uid, new Set([...(substituidos.get(uid) ?? []), data.data.getTime()]));
  }
  const lista: EventoIcs[] = [];
  for (const e of eventos) {
    if ((e.get("STATUS")?.[0]?.valor ?? "").toUpperCase() === "CANCELLED") continue;
    const inicioProp = e.get("DTSTART")?.[0];
    const inicio = inicioProp ? dataIcs(inicioProp) : null;
    if (!inicio) continue;
    const fimProp = e.get("DTEND")?.[0];
    const fim = fimProp ? dataIcs(fimProp) : null;
    const duracao = fim ? fim.data.getTime() - inicio.data.getTime() : 0;
    const uid = e.get("UID")?.[0]?.valor ?? `${agenda}-${inicio.data.getTime()}`;
    const ehSubstituto = e.has("RECURRENCE-ID");
    const excecoes = new Set<number>(ehSubstituto ? [] : [...(substituidos.get(uid) ?? [])]);
    for (const ex of e.get("EXDATE") ?? []) for (const parte of ex.valor.split(",")) {
      const d = dataIcs({ valor: parte, parametros: ex.parametros });
      if (d) excecoes.add(d.data.getTime());
    }
    const regra = ehSubstituto ? null : e.get("RRULE")?.[0]?.valor ?? null;
    const inicioDaJanela = new Date(de.getTime() - Math.max(0, duracao));
    for (const ocorrencia of ocorrenciasDoEvento(inicio.data, regra, inicioDaJanela, ate, excecoes)) {
      lista.push({
        id: `${uid}-${ocorrencia.getTime()}`,
        titulo: textoIcs(e.get("SUMMARY")?.[0]?.valor ?? "").slice(0, 160) || "(sem título)",
        inicio: ocorrencia.toISOString(),
        fim: duracao > 0 ? new Date(ocorrencia.getTime() + duracao).toISOString() : null,
        diaInteiro: inicio.diaInteiro,
        local: textoIcs(e.get("LOCATION")?.[0]?.valor ?? "").slice(0, 160),
        agenda,
      });
    }
  }
  return lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export function nomeDaAgenda(texto: string, reserva: string): string {
  const nome = /^X-WR-CALNAME:(.+)$/m.exec(desdobrarLinhas(texto).join("\n"))?.[1];
  return nome ? textoIcs(nome).slice(0, 60) : reserva;
}

import { useEffect, useState } from "react";
import { useComunicacao } from "../../estado/comunicacao";
import { conexoesPonte, type EventoDeAgenda } from "../../ponte/conexoesReais";
import { paraISO } from "../../utilitarios/datas";

const INTERVALO_MS = 15 * 60_000;

export interface EventoDeAgendaNoDia {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  agenda: string;
}

export function eventoNoDia(e: EventoDeAgenda): EventoDeAgendaNoDia {
  const inicio = new Date(e.inicio);
  return {
    id: e.id,
    titulo: e.titulo,
    data: paraISO(inicio),
    hora: e.diaInteiro ? undefined : `${String(inicio.getHours()).padStart(2, "0")}:${String(inicio.getMinutes()).padStart(2, "0")}`,
    agenda: e.agenda,
  };
}

export function usarAgendasPorLink(ativo: boolean): { ligada: boolean; eventos: EventoDeAgendaNoDia[] } {
  const conexao = useComunicacao((s) => s.conexoes.find((c) => c.id === "calendario"));
  const ligada = ativo && Boolean(conexao?.ligada && conexao.chaveSalva);
  const [eventos, setEventos] = useState<EventoDeAgendaNoDia[]>([]);

  useEffect(() => {
    if (!ligada) {
      setEventos([]);
      return;
    }
    let vivo = true;
    const ler = () => {
      if (document.hidden) return;
      void conexoesPonte
        .ler("calendario")
        .then((d) => vivo && setEventos(d.eventos.map(eventoNoDia)))
        .catch(() => undefined);
    };
    ler();
    const relogio = window.setInterval(ler, INTERVALO_MS);
    document.addEventListener("visibilitychange", ler);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", ler);
    };
  }, [ligada]);

  return { ligada, eventos };
}

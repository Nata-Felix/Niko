import { useEffect } from "react";
import { TourGuiado, type PassoDoTour } from "../../componentes/TourGuiado";
import { useTour } from "../../estado/tour";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { T } from "../../textos/textos";

const P = T.tour.passos;

export const PASSOS_DO_TOUR: PassoDoTour[] = [
  { titulo: P.boasVindas.titulo, texto: P.boasVindas.texto },
  { alvo: ".barra-lateral", titulo: P.barra.titulo, texto: P.barra.texto, lado: "direita" },
  { alvo: ".inicio-time", titulo: P.time.titulo, texto: P.time.texto, lado: "baixo" },
  { alvo: '[data-rota="journal"]', titulo: P.journal.titulo, texto: P.journal.texto, lado: "direita", folga: 4 },
  { alvo: '[data-rota="estudos"]', titulo: P.estudos.titulo, texto: P.estudos.texto, lado: "direita", folga: 4 },
  { alvo: '[data-rota="financas"]', titulo: P.financas.titulo, texto: P.financas.texto, lado: "direita", folga: 4 },
  { alvo: '[data-tour="ajustes"]', titulo: P.ajustes.titulo, texto: P.ajustes.texto, lado: "direita", folga: 4 },
  { titulo: P.ilha.titulo, texto: P.ilha.texto },
];

export function TourDoNiko() {
  const aberto = useTour((s) => s.aberto);
  const fechar = useTour((s) => s.fechar);

  useEffect(() => {
    if (!aberto) return;
    const ui = useInterface.getState();
    ui.irPara("inicio");
  }, [aberto]);

  return (
    <TourGuiado
      passos={PASSOS_DO_TOUR}
      aberto={aberto}
      aoFechar={() => {
        fechar();
        useConfig.getState().definir({ tourVisto: true });
      }}
    />
  );
}

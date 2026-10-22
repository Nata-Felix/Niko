import { AnimatePresence } from "motion/react";
import { Ilha } from "../ilha/Ilha";
import { Dock } from "../dock/Dock";
import { AssistiveTouch } from "../assistive/AssistiveTouch";
import { JanelaSistema } from "../sistema/JanelaSistema";
import { JanelaConexao } from "../../modulos/conexoes/JanelaConexao";
import { BuscaGlobal } from "../../modulos/busca/BuscaGlobal";
import { CapturaRapida } from "../../modulos/busca/CapturaRapida";
import { PrimeiraExecucao } from "../../modulos/configuracoes/PrimeiraExecucao";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { usarTema } from "./usarTema";
import { usarAtalhos } from "./usarAtalhos";
import { useServicos } from "../../servicos/servicos";

export function AreaDeTrabalho() {
  usarTema();
  usarAtalhos();
  useServicos();
  const aberto = useInterface((s) => s.sistemaAberto);
  const minimizado = useInterface((s) => s.sistemaMinimizado);
  const janelas = useInterface((s) => s.janelasConexao);
  const primeira = useConfig((s) => s.primeiraExecucaoFeita);

  return (
    <div className="area-trabalho">
      <AnimatePresence>{aberto && !minimizado && <JanelaSistema key="sistema" />}</AnimatePresence>
      <AnimatePresence>
        {janelas.filter((j) => !j.minimizada).map((j) => (
          <JanelaConexao key={j.id} janela={j} />
        ))}
      </AnimatePresence>
      <Ilha />
      <Dock />
      <AssistiveTouch />
      <BuscaGlobal />
      <CapturaRapida />
      {!primeira && <PrimeiraExecucao />}
    </div>
  );
}

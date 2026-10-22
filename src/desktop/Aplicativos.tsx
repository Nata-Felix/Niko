import { useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { Ilha } from "../janelas/ilha/Ilha";
import { Dock } from "../janelas/dock/Dock";
import { AssistiveTouch } from "../janelas/assistive/AssistiveTouch";
import { JanelaSistema } from "../janelas/sistema/JanelaSistema";
import { JanelaConexao } from "../modulos/conexoes/JanelaConexao";
import { BuscaGlobal } from "../modulos/busca/BuscaGlobal";
import { CapturaRapida } from "../modulos/busca/CapturaRapida";
import { PrimeiraExecucao } from "../modulos/configuracoes/PrimeiraExecucao";
import { useInterface } from "../estado/interface";
import { useConfig } from "../estado/configuracoes";
import { usarTema } from "../janelas/area-de-trabalho/usarTema";
import { usarAtalhos } from "../janelas/area-de-trabalho/usarAtalhos";
import { useServicos } from "../servicos/servicos";
import { usarPreferenciasDaJanela } from "../servicos/usarPreferenciasDaJanela";
import { definirMonitorDaIlha, janelaAtual, ouvirComandos, ouvirEvento, sincronizarInicioComWindows } from "./desktop";
import { usarSincronia } from "./sincronia";
import { usarAtalhosDaIlha, usarAtalhosGlobais } from "./usarAtalhosGlobais";

export function AppSistema() {
  usarTema();
  usarPreferenciasDaJanela();
  usarAtalhos();
  usarAtalhosGlobais();
  usarSincronia();
  const janelas = useInterface((s) => s.janelasConexao);
  const primeira = useConfig((s) => s.primeiraExecucaoFeita);
  const iniciarComWindows = useConfig((s) => s.iniciarComWindows);

  useEffect(() => {
    void sincronizarInicioComWindows(iniciarComWindows);
  }, [iniciarComWindows]);

  useEffect(
    () =>
      ouvirComandos((c) => {
        const ui = useInterface.getState();
        if (c.tipo === "irPara") ui.irParaLocal(c.rota, c.parametros);
        if (c.tipo === "abrirConexao") ui.abrirJanelaConexaoLocal(c.id);
        if (c.tipo === "abrirBusca") ui.abrirBusca(true);
        if (c.tipo === "abrirCaptura") ui.abrirCaptura(true);
        if (c.tipo === "abrirEstilosDaMidia") ui.abrirEstilosDaMidia(true);
      }),
    [],
  );

  useEffect(() => {
    let desligar = () => undefined as void;
    void ouvirEvento("niko://captura", () => useInterface.getState().abrirCaptura(true)).then((f) => (desligar = f));
    return () => desligar();
  }, []);

  return (
    <div className="area-trabalho area-nativa estilo-sistema">
      <JanelaSistema />
      <AnimatePresence>
        {janelas.filter((j) => !j.minimizada).map((j) => (
          <JanelaConexao key={j.id} janela={j} />
        ))}
      </AnimatePresence>
      <BuscaGlobal />
      <CapturaRapida />
      {!primeira && <PrimeiraExecucao />}
    </div>
  );
}

function usarMostrarAoMontar() {
  useEffect(() => {
    const t = window.setTimeout(() => void janelaAtual().then((j) => j.show()), 120);
    return () => window.clearTimeout(t);
  }, []);
}

function usarMonitorDaIlha() {
  const monitor = useConfig((s) => s.ilha.monitor);
  useEffect(() => {
    void definirMonitorDaIlha(monitor);
  }, [monitor]);
}

export function AppIlha() {
  usarMostrarAoMontar();
  usarMonitorDaIlha();
  usarTema();
  usarSincronia();
  usarAtalhosDaIlha();
  useServicos();
  return (
    <div className="area-sobreposta">
      <Ilha />
    </div>
  );
}

export function AppDock() {
  usarMostrarAoMontar();
  usarTema();
  usarPreferenciasDaJanela();
  usarSincronia();
  return (
    <div className="area-sobreposta">
      <Dock />
    </div>
  );
}

export function AppAssistive() {
  usarTema();
  usarSincronia();
  const ativo = useConfig((s) => s.assistive.ativo);
  useEffect(() => {
    let vivo = true;
    void janelaAtual().then((j) => { if (vivo) return ativo ? j.show() : j.hide(); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [ativo]);
  return <div className="area-sobreposta"><AssistiveTouch /></div>;
}

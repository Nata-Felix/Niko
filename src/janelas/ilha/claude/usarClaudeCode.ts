import { useEffect } from "react";
import { claudeCode, ouvirClaudeCode, type EventoClaude } from "../../../ponte/claudeCode";
import { frenteCobreAIlha, frenteEmTelaCheia, notificarWindows } from "../../../desktop/desktop";
import { useClaudeCode } from "../../../estado/claudeCode";
import { useHistoricoCodigo } from "../../../estado/historicoCodigo";
import { resumoDaSemana, semanaPassada } from "../../../utilitarios/resumoSemanal";
import { paraISO } from "../../../utilitarios/datas";
import { avisoLigado, useIlha } from "../../../estado/ilha";
import { useConfig } from "../../../estado/configuracoes";
import { tocarSom } from "../../../ponte/sons";
import { T } from "../../../textos/textos";
import { MARCA_DA_FERRAMENTA, nomeDaFerramenta } from "./ferramentas";

const TOLERANCIA_MS = 1500;

function abaLigada() {
  const { ilha } = useConfig.getState();
  return ilha.ativa && ilha.blocos.claude;
}

async function notificarSeEscondida(corpo: string) {
  const cfg = useConfig.getState();
  if (!cfg.notificarClaude || cfg.naoPerturbe || !avisoLigado("codigo")) return;
  const ilha = useIlha.getState();
  if (ilha.estado === "expandida" && ilha.aba === "claude") return;
  if (ilha.estado !== "escondida" && !(await frenteCobreAIlha())) return;
  await notificarWindows(T.app.nome, corpo);
}

async function terminalDaSessaoNaFrente(sessao: string): Promise<boolean> {
  if (!sessao || !useConfig.getState().silenciarComTerminalNaFrente) return false;
  return claudeCode.terminalNaFrente(sessao).then((r) => r.naFrente === true).catch(() => false);
}

function devolverAoTerminal(pedidoId: string) {
  useClaudeCode.getState().removerPedido(pedidoId);
  void claudeCode.decidir(pedidoId, "terminal").catch(() => undefined);
}

export function fecharSessao(id: string) {
  for (const p of useClaudeCode.getState().pedidos) if (p.sessao === id) devolverAoTerminal(p.pedidoId);
  useClaudeCode.getState().fechar(id);
}

export function devolverPendentesAoTerminal() {
  for (const p of useClaudeCode.getState().pedidos) devolverAoTerminal(p.pedidoId);
}

function avisarResumoDaSemana() {
  if (!useHistoricoCodigo.persist.hasHydrated()) return;
  const historico = useHistoricoCodigo.getState();
  const semana = paraISO(semanaPassada(new Date()));
  if (historico.ultimoResumoVisto === semana || useConfig.getState().naoPerturbe || !avisoLigado("codigo") || !abaLigada()) return;
  if (resumoDaSemana(historico.historico, semanaPassada(new Date())).sessoes === 0) return;
  historico.definir({ ultimoResumoVisto: semana });
  useIlha.getState().revelar({ texto: T.ilha.claude.resumo.aviso, tipo: "info", marca: "claudecode", aba: "claude" }, 6000, "normal");
}

function reagir(e: EventoClaude) {
  const estado = useClaudeCode.getState();
  const sessao = estado.sessoes[e.sessao];
  const projeto = sessao?.projeto ?? "";
  const ferramenta = sessao?.ferramenta ?? e.ferramenta ?? "claude";
  const nome = nomeDaFerramenta(ferramenta);
  const marca = MARCA_DA_FERRAMENTA[ferramenta];
  const silencio = useConfig.getState().naoPerturbe || !avisoLigado("codigo");
  const ilha = useIlha.getState();
  switch (e.evento) {
    case "PermissionRequest": {
      const pedidoId = e.pedidoId;
      if (!pedidoId) return;
      if (!abaLigada()) {
        devolverAoTerminal(pedidoId);
        return;
      }
      void frenteEmTelaCheia().then((cheia) => {
        if (cheia) {
          devolverAoTerminal(pedidoId);
          return;
        }
        if (!useClaudeCode.getState().pedidos.some((p) => p.pedidoId === pedidoId)) return;
        useClaudeCode.getState().focar(e.sessao);
        const ehPergunta = e.dados.tool_name === "AskUserQuestion";
        void tocarSom(ehPergunta ? "question" : "approval", "avisos");
        void notificarSeEscondida(ehPergunta ? T.ilha.claude.notificacao.pergunta(nome, projeto) : T.ilha.claude.notificacao.permissao(nome, projeto));
        const ilhaAgora = useIlha.getState();
        if (ilhaAgora.estado === "escondida") ilhaAgora.definirEstado("compacta");
      });
      return;
    }
    case "Stop": {
      if (silencio || !abaLigada()) return;
      estado.focar(e.sessao);
      void terminalDaSessaoNaFrente(e.sessao).then((naFrente) => {
        if (naFrente) return;
        if (useIlha.getState().revelar({ texto: T.ilha.claude.terminouAviso(nome, projeto), tipo: "sucesso", marca, aba: "claude" }, 7000)) void tocarSom("finish", "avisos");
        void notificarSeEscondida(T.ilha.claude.notificacao.terminou(nome, projeto));
      });
      return;
    }
    case "StopFailure":
      if (silencio || !abaLigada()) return;
      void terminalDaSessaoNaFrente(e.sessao).then((naFrente) => {
        if (naFrente) return;
        if (useIlha.getState().revelar({ texto: T.ilha.claude.erroAviso(nome, projeto), tipo: "alerta", marca, aba: "claude" }, 6000)) void tocarSom("error", "avisos");
        void notificarSeEscondida(T.ilha.claude.notificacao.erro(nome, projeto));
      });
      return;
    case "NikoPedidoEncerrado": {
      const motivo = e.dados.motivo;
      if (!abaLigada() || (motivo !== "expirou" && motivo !== "cancelado")) return;
      ilha.revelar({ texto: T.ilha.claude.pedidoEncerrado[motivo], tipo: "alerta", marca, aba: "claude" }, 6000);
      return;
    }
    case "Notification":
      if (silencio || !abaLigada()) return;
      if (sessao?.estado === "esperando") {
        if (ilha.revelar({ texto: T.ilha.claude.esperandoAviso(nome, projeto), tipo: "info", marca, aba: "claude" }, 6000)) void tocarSom("question", "avisos");
      } else if (sessao?.estado === "limite") {
        if (ilha.revelar({ texto: T.ilha.claude.limiteAviso(nome, projeto), tipo: "alerta", marca, aba: "claude" }, 6000)) void tocarSom("rate", "avisos");
      }
      return;
    default:
      return;
  }
}

function marcarInstalado(instalado: boolean) {
  const cfg = useConfig.getState();
  if (cfg.claudeInstalado !== instalado) cfg.definir({ claudeInstalado: instalado });
}

export function usarClaudeCode(ligado: boolean) {
  useEffect(() => {
    if (!ligado) return;
    claudeCode
      .instalacao()
      .then((e) => marcarInstalado(e.instalado || e.parcial || e.desatualizado))
      .catch(() => undefined);
  }, [ligado]);

  useEffect(() => {
    if (!ligado) {
      useClaudeCode.getState().definirConectado(false);
      return;
    }
    let conectadoEm = Date.now();
    return ouvirClaudeCode(
      (e) => {
        if (e.sessao) marcarInstalado(true);
        useClaudeCode.getState().aplicar(e);
        useHistoricoCodigo.getState().registrar(e);
        if (e.evento === "UserPromptSubmit") avisarResumoDaSemana();
        if (Date.parse(e.recebidoEm) >= conectadoEm - TOLERANCIA_MS) reagir(e);
      },
      (conectado) => {
        if (conectado) conectadoEm = Date.now();
        useClaudeCode.getState().definirConectado(conectado);
      },
    );
  }, [ligado]);
}

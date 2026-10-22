import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleDashed, Link2, Link2Off, RefreshCw, TriangleAlert } from "lucide-react";
import { Botao, Modal, AvisoFaixa } from "../../componentes/basicos";
import { AlternadorAjuste, LinhaAjuste, NotaAjuste } from "./LinhaAjuste";
import { Marca } from "../../marcas/Marca";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { claudeCode, type EstadoDaInstalacao, type PreviaDaInstalacao } from "../../ponte/claudeCode";
import { tocarSom } from "../../ponte/sons";
import { permitirNotificacoes } from "../../desktop/desktop";
import { T } from "../../textos/textos";

const C = T.configuracoes.claudeCode;

function situacao(e: EstadoDaInstalacao | null): { rotulo: string; tipo: "ok" | "alerta" | "neutro" } {
  if (!e) return { rotulo: C.estados.desconectado, tipo: "neutro" };
  if (e.invalido) return { rotulo: C.estados.invalido, tipo: "alerta" };
  if (e.desatualizado) return { rotulo: C.estados.desatualizado, tipo: "alerta" };
  if (e.instalado && e.conectado) return { rotulo: C.estados.conectado, tipo: "ok" };
  if (e.instalado) return { rotulo: C.estados.instalado, tipo: "ok" };
  if (e.parcial) return { rotulo: C.estados.parcial, tipo: "alerta" };
  if (!e.claudeInstalado) return { rotulo: C.estados.semClaude, tipo: "alerta" };
  return { rotulo: C.estados.desconectado, tipo: "neutro" };
}

export function SecaoClaudeCode() {
  const avisar = useInterface((s) => s.avisar);
  const ilha = useConfig((s) => s.ilha);
  const definirIlha = useConfig((s) => s.definirIlha);
  const definir = useConfig((s) => s.definir);
  const notificar = useConfig((s) => s.notificarClaude);
  const silenciarComTerminal = useConfig((s) => s.silenciarComTerminalNaFrente);
  const [estado, setEstado] = useState<EstadoDaInstalacao | null>(null);
  const [previa, setPrevia] = useState<{ acao: "instalar" | "remover"; dados: PreviaDaInstalacao } | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");

  const atualizar = useCallback(() => {
    claudeCode.instalacao().then(setEstado).catch(() => setEstado(null));
  }, []);

  useEffect(() => {
    atualizar();
    window.addEventListener("focus", atualizar);
    return () => window.removeEventListener("focus", atualizar);
  }, [atualizar]);

  const abrirPrevia = (acao: "instalar" | "remover") => {
    setErro("");
    claudeCode
      .previa(acao)
      .then((dados) => setPrevia({ acao, dados }))
      .catch((e: Error) => setErro(e.message === "settings_invalido" ? C.invalidoDica : C.falhou));
  };

  const confirmar = () => {
    if (!previa || trabalhando) return;
    setTrabalhando(true);
    const acao = previa.acao;
    (acao === "instalar" ? claudeCode.instalar() : claudeCode.remover())
      .then((r) => {
        if (acao === "instalar") definirIlha({ blocos: { ...useConfig.getState().ilha.blocos, claude: true } });
        definir({ claudeInstalado: acao === "instalar" });
        avisar(acao === "instalar" ? C.conectadoAviso(r.copia) : C.removidoAviso(r.copia));
        void tocarSom(acao === "instalar" ? "approve" : "close", "interface");
        setPrevia(null);
        atualizar();
      })
      .catch((e: Error) => setErro(e.message === "settings_invalido" ? C.invalidoDica : e.message === "sem_curl" ? T.ilha.claude.config.falhou.sem_curl : C.falhou))
      .finally(() => setTrabalhando(false));
  };

  const s = situacao(estado);
  const instalado = Boolean(estado?.instalado || estado?.parcial || estado?.desatualizado);

  return (
    <>
      <LinhaAjuste
        rotulo={C.titulo}
        dica={C.texto}
        inicio={
          <span className="ajuste-caixa-icone ajuste-caixa-icone-grande">
            <Marca marca="claudecode" tamanho={20} />
          </span>
        }
      >
        <span className="ajuste-estado" data-tipo={s.tipo}>
          {s.tipo === "ok" ? <CircleCheck size={13} /> : s.tipo === "alerta" ? <TriangleAlert size={13} /> : <CircleDashed size={13} />}
          {s.rotulo}
        </span>
      </LinhaAjuste>

      <NotaAjuste>
        <ul className="ajuste-lista-recursos">
          {C.recursos.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </NotaAjuste>

      {(erro || estado?.invalido) && (
        <NotaAjuste>
          {erro && <AvisoFaixa tipo="erro">{erro}</AvisoFaixa>}
          {estado?.invalido && <AvisoFaixa tipo="alerta">{C.invalidoDica}</AvisoFaixa>}
        </NotaAjuste>
      )}

      <LinhaAjuste rotulo={T.configuracoes.conexaoClaude}>
        {instalado && (
          <Botao variante="perigo" icone={<Link2Off size={13} />} disabled={estado?.invalido} onClick={() => abrirPrevia("remover")}>
            {C.remover}
          </Botao>
        )}
        <Botao variante="primario" icone={instalado ? <RefreshCw size={13} /> : <Link2 size={13} />} disabled={estado?.invalido} onClick={() => abrirPrevia("instalar")}>
          {instalado ? C.reconectar : C.conectar}
        </Botao>
      </LinhaAjuste>

      <AlternadorAjuste rotulo={C.mostrarAba} dica={C.mostrarAbaDica} ligado={ilha.blocos.claude} aoMudar={(v) => definirIlha({ blocos: { ...ilha.blocos, claude: v } })} />
      <AlternadorAjuste rotulo={C.silenciarComTerminal} dica={C.silenciarComTerminalDica} ligado={silenciarComTerminal} aoMudar={(v) => definir({ silenciarComTerminalNaFrente: v })} />
      <AlternadorAjuste
        rotulo={C.notificar}
        dica={C.notificarDica}
        ligado={notificar}
        aoMudar={(v) => {
          if (!v) return definir({ notificarClaude: false });
          void permitirNotificacoes().then((ok) => {
            definir({ notificarClaude: ok });
            if (!ok) setErro(C.notificarNegado);
          });
        }}
      />

      <Modal aberto={!!previa} titulo={previa?.acao === "remover" ? C.previaRemover : C.previaConectar} aoFechar={() => setPrevia(null)} largo>
        {previa && (
          <div className="formulario">
            <div className="campo-grupo">
              <span className="campo-rotulo">{C.arquivo}</span>
              <code className="claude-config-caminho">{previa.dados.caminho}</code>
            </div>
            <AvisoFaixa>{C.copiaAviso}</AvisoFaixa>
            <div className="claude-config-diff">
              <div className="coluna" style={{ gap: 4, minWidth: 0 }}>
                <span className="campo-rotulo">{C.antes}</span>
                <pre className="claude-config-codigo">{previa.dados.atual ?? C.arquivoNovo}</pre>
              </div>
              <div className="coluna" style={{ gap: 4, minWidth: 0 }}>
                <span className="campo-rotulo">{C.depois}</span>
                <pre className="claude-config-codigo">{previa.dados.proposto}</pre>
              </div>
            </div>
            <span className="campo-dica">{C.segredoAviso}</span>
            <span className="campo-dica">{C.reiniciarAviso}</span>
            <div className="formulario-acoes">
              <Botao onClick={() => setPrevia(null)}>{T.geral.cancelar}</Botao>
              <Botao variante={previa.acao === "remover" ? "perigo" : "primario"} disabled={trabalhando} onClick={confirmar}>
                {previa.acao === "remover" ? C.confirmarRemover : C.confirmarConectar}
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

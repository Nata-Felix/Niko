import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { BookOpen, LoaderCircle, MessageCircle, X } from "lucide-react";
import { useEstudos } from "../../estado/estudos";
import { useIlha } from "../../estado/ilha";
import { useArquivosSoltos } from "../../estado/arquivosSoltos";
import { enviarArquivo, extensaoDe, EXTENSOES_ACEITAS, LIMITE_ARQUIVO } from "../../ponte/arquivos";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";

const S = T.ilha.soltar;

type Fase = { tipo: "arrastando" } | { tipo: "escolherMateria"; arquivos: File[] } | { tipo: "enviando" };

function arquivosDoEvento(e: React.DragEvent): File[] {
  return Array.from(e.dataTransfer.files ?? []);
}

function AlvoDeSoltar({ icone, rotulo, aoSoltar }: { icone: React.ReactNode; rotulo: string; aoSoltar: (arquivos: File[]) => void }) {
  const [perto, setPerto] = useState(false);
  return (
    <div
      className="destino-alvo"
      data-perto={perto || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setPerto(true);
      }}
      onDragLeave={() => setPerto(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPerto(false);
        const arquivos = arquivosDoEvento(e);
        if (arquivos.length) aoSoltar(arquivos);
      }}
    >
      {icone}
      <span>{rotulo}</span>
    </div>
  );
}

export function DestinoDoArquivo({ aoFechar, comChat }: { aoFechar: () => void; comChat: boolean }) {
  const [fase, setFase] = useState<Fase>({ tipo: "arrastando" });
  const materias = useEstudos((s) => s.materias);
  const contador = useRef(0);

  useEffect(() => {
    if (fase.tipo !== "arrastando") return;
    const sair = () => {
      contador.current = Math.max(0, contador.current - 1);
      if (contador.current === 0) aoFechar();
    };
    const entrar = () => {
      contador.current += 1;
    };
    const terminar = () => aoFechar();
    window.addEventListener("dragenter", entrar);
    window.addEventListener("dragleave", sair);
    window.addEventListener("dragend", terminar);
    contador.current = 1;
    return () => {
      window.removeEventListener("dragenter", entrar);
      window.removeEventListener("dragleave", sair);
      window.removeEventListener("dragend", terminar);
    };
  }, [fase.tipo, aoFechar]);

  const mandarAoChat = (arquivos: File[]) => {
    useArquivosSoltos.getState().mandarAoChat(arquivos);
    useIlha.getState().abrir("chat");
    void tocarSom("gulp", "personagens");
    aoFechar();
  };

  const guardarNaMateria = async (materiaId: string, nome: string, arquivos: File[]) => {
    setFase({ tipo: "enviando" });
    const recusados = arquivos.filter((a) => a.size > LIMITE_ARQUIVO || !EXTENSOES_ACEITAS.includes(extensaoDe(a.name)));
    const aceitos = arquivos.filter((a) => !recusados.includes(a));
    const resultados = await Promise.allSettled(aceitos.map((a) => enviarArquivo(materiaId, a)));
    const enviados = resultados.filter((r) => r.status === "fulfilled").length;
    const falhas = arquivos.length - enviados;
    useIlha.getState().revelar({ texto: falhas === 0 ? S.guardados(enviados, nome) : S.falhou(falhas, arquivos.length), tipo: falhas === 0 ? "sucesso" : "alerta" }, 5000);
    void tocarSom(falhas === 0 ? "gulp" : "error", falhas === 0 ? "personagens" : "avisos");
    aoFechar();
  };

  return (
    <motion.div className="destino-arquivo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
      e.preventDefault();
      if (fase.tipo === "arrastando") aoFechar();
    }}>
      {fase.tipo === "arrastando" && (
        <div className="destino-alvos">
          {comChat && <AlvoDeSoltar icone={<MessageCircle size={22} />} rotulo={S.chat} aoSoltar={mandarAoChat} />}
          <AlvoDeSoltar icone={<BookOpen size={22} />} rotulo={S.materia} aoSoltar={(arquivos) => setFase({ tipo: "escolherMateria", arquivos })} />
        </div>
      )}
      {fase.tipo === "escolherMateria" && (
        <div className="destino-materias">
          <div className="destino-topo">
            <span>{S.escolherMateria(fase.arquivos.length)}</span>
            <button type="button" className="destino-fechar" aria-label={S.cancelar} title={S.cancelar} onClick={aoFechar}>
              <X size={14} />
            </button>
          </div>
          {materias.length === 0 ? (
            <span className="destino-vazio">{S.semMaterias}</span>
          ) : (
            <div className="destino-lista">
              {materias.map((m) => (
                <button key={m.id} type="button" className="destino-materia" onClick={() => void guardarNaMateria(m.id, m.nome, fase.arquivos)}>
                  <BookOpen size={13} />
                  <span className="cortar">{m.nome}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {fase.tipo === "enviando" && (
        <div className="destino-enviando">
          <LoaderCircle size={18} className="girando" />
          <span>{S.enviando}</span>
        </div>
      )}
    </motion.div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, useAnimate, useVelocity } from "motion/react";
import { Check, FileCode2, FileSpreadsheet, FileText, Image as ImagemIcone, Presentation, X } from "lucide-react";
import { Personagem } from "../personagens/Personagem";
import { lerAnexo, tipoDoAnexo, formatarTamanho, MAXIMO_ANEXOS, type AnexoPronto, type FalhaAnexo } from "../utilitarios/anexos";
import { gerarId } from "../utilitarios/basicos";
import { mensagemDeLeitura } from "../utilitarios/leitorDeArquivos";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";
import type { AgenteId } from "../tipos";
import { TrajetoDoArquivo } from "../janelas/ilha/animacoes/TrajetoDoArquivo";

export interface AnexoEmAndamento {
  id: string;
  nome: string;
  tamanho: number;
  tipo: "texto" | "imagem" | "outro";
  progresso: number;
  pronto?: AnexoPronto;
}

const DURACAO_MINIMA = 1400;

export function useAnexos(aoErro: (texto: string) => void) {
  const [lista, setLista] = useState<AnexoEmAndamento[]>([]);
  const atual = useRef(lista);
  atual.current = lista;

  const adicionar = useCallback(
    (arquivos: File[]) => {
      const vagas = MAXIMO_ANEXOS - atual.current.length;
      if (arquivos.length > vagas) aoErro(T.chat.anexos.maximo);
      for (const arquivo of arquivos.slice(0, Math.max(0, vagas))) {
        const id = gerarId();
        const inicio = performance.now();
        let real = 0;
        let ultimoTique = 0;
        setLista((l) => [...l, { id, nome: arquivo.name, tamanho: arquivo.size, tipo: tipoDoAnexo(arquivo), progresso: 0 }]);
        const animar = () => {
          const tempo = Math.min(1, (performance.now() - inicio) / DURACAO_MINIMA);
          const visivel = Math.min(real, tempo < 0.4 ? (tempo / 0.4) * 0.6 : tempo < 0.85 ? 0.6 + ((tempo - 0.4) / 0.45) * 0.32 : 0.92 + ((tempo - 0.85) / 0.15) * 0.08);
          const dezena = Math.floor(visivel * 10);
          if (dezena > ultimoTique) {
            ultimoTique = dezena;
            void tocarSom("tick", "interface");
          }
          setLista((l) => l.map((a) => (a.id === id && !a.pronto ? { ...a, progresso: visivel } : a)));
          if (visivel < 1 && atual.current.some((a) => a.id === id)) requestAnimationFrame(animar);
        };
        requestAnimationFrame(animar);
        lerAnexo(arquivo, (p) => (real = Math.min(0.999, p)))
          .then(async (pronto) => {
            real = 1;
            const falta = DURACAO_MINIMA - (performance.now() - inicio);
            if (falta > 0) await new Promise((r) => setTimeout(r, falta));
            setLista((l) => l.map((a) => (a.id === id ? { ...a, progresso: 1, pronto } : a)));
            void tocarSom("approve", "interface");
          })
          .catch((e: Error) => {
            console.error("Falha ao ler o anexo", arquivo.name, e);
            setLista((l) => l.filter((a) => a.id !== id));
            const motivo = (["grande", "tipo", "leitura"].includes(e.message) ? e.message : "leitura") as FalhaAnexo;
            aoErro(mensagemDeLeitura(e, arquivo.name) ?? T.chat.anexos[motivo](arquivo.name));
            void tocarSom("error", "avisos");
          });
      }
    },
    [aoErro],
  );

  return {
    lista,
    adicionar,
    remover: (id: string) => setLista((l) => l.filter((a) => a.id !== id)),
    limpar: () => setLista([]),
    carregando: lista.some((a) => !a.pronto),
    prontos: () => lista.flatMap((a) => (a.pronto ? [a.pronto] : [])),
  };
}

export function useArrastarArquivos(alvo: React.RefObject<HTMLElement | null>, aoSoltar: (arquivos: File[]) => void) {
  const [arrastando, setArrastando] = useState(false);
  const contador = useRef(0);
  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const entrar = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      contador.current += 1;
      if (contador.current === 1) {
        setArrastando(true);
        void tocarSom("peek", "interface");
      }
    };
    const sobre = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const sair = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      contador.current = Math.max(0, contador.current - 1);
      if (contador.current === 0) setArrastando(false);
    };
    const soltar = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault();
      contador.current = 0;
      const arquivos = Array.from(e.dataTransfer?.files ?? []);
      window.setTimeout(() => setArrastando(false), 520);
      if (arquivos.length) {
        void tocarSom("gulp", "interface");
        aoSoltar(arquivos);
      }
    };
    el.addEventListener("dragenter", entrar);
    el.addEventListener("dragover", sobre);
    el.addEventListener("dragleave", sair);
    el.addEventListener("drop", soltar);
    return () => {
      el.removeEventListener("dragenter", entrar);
      el.removeEventListener("dragover", sobre);
      el.removeEventListener("dragleave", sair);
      el.removeEventListener("drop", soltar);
    };
  }, [alvo, aoSoltar]);
  return arrastando;
}

export function ZonaDeSoltar({ ativo, agente, compacta, texto = T.chat.anexos.solte, tipos = T.chat.anexos.tipos }: { ativo: boolean; agente: AgenteId; compacta?: boolean; texto?: string; tipos?: readonly string[] }) {
  const caixa = useRef<HTMLDivElement>(null);
  const xBruto = useMotionValue(0);
  const x = useSpring(xBruto, { stiffness: 260, damping: 22 });
  const velocidade = useVelocity(x);
  const inclinacao = useTransform(velocidade, [-1200, 0, 1200], [-12, 0, 12], { clamp: true });
  const [perto, setPerto] = useState(false);
  const [escopo, animar] = useAnimate();
  const [engoliu, setEngoliu] = useState(false);

  useEffect(() => {
    if (!ativo) {
      setEngoliu(false);
      return;
    }
    const el = caixa.current;
    if (!el) return;
    const mover = (e: DragEvent) => {
      const r = el.getBoundingClientRect();
      const meio = r.width / 2;
      const alvoX = Math.max(-meio + 50, Math.min(meio - 50, e.clientX - r.left - meio));
      xBruto.set(alvoX);
      const distancia = Math.hypot(e.clientX - (r.left + meio + alvoX), e.clientY - (r.top + r.height * 0.42));
      setPerto((p) => (p ? distancia < 140 : distancia < 90));
    };
    const soltou = (evento: DragEvent) => {
      if (!evento.dataTransfer?.files.length || !caixa.current?.parentElement?.contains(evento.target as Node)) return;
      setEngoliu(true);
      if (escopo.current) void animar(escopo.current, { scaleY: [1, 0.86, 1.12, 0.95, 1], scaleX: [1, 1.14, 0.94, 1.03, 1] }, { duration: 0.5, ease: "easeOut" });
    };
    window.addEventListener("dragover", mover);
    window.addEventListener("drop", soltou);
    return () => {
      window.removeEventListener("dragover", mover);
      window.removeEventListener("drop", soltou);
    };
  }, [ativo, xBruto, animar, escopo]);

  useEffect(() => {
    if (perto && escopo.current) void animar(escopo.current, { y: [0, -8, 0] }, { duration: 0.28, ease: "easeOut" });
  }, [perto, animar, escopo]);

  return (
    <AnimatePresence>
      {ativo && (
        <motion.div
          ref={caixa}
          className={`zona-soltar${compacta ? " zona-soltar-compacta" : ""}`}
          data-perto={perto ? "sim" : "nao"}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1, transition: { type: "spring", visualDuration: 0.3, bounce: 0.3 } }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
        >
          <svg className="zona-soltar-borda" aria-hidden="true">
            <rect x="1" y="1" rx="18" ry="18" />
          </svg>
          <span className="zona-soltar-brilho" />
          <motion.div className="zona-soltar-boneco" style={{ x, rotate: inclinacao }}>
            <div ref={escopo}>
              <Personagem agente={agente} estado={engoliu ? "pensando" : perto ? "ouvindo" : "pensando"} tamanho={compacta ? 84 : 112} interativo={false} halo={false} />
            </div>
          </motion.div>
          <div className="zona-soltar-texto" style={{ opacity: perto ? 0.35 : 1 }}>
            <b>{texto}</b>
            <span className="zona-soltar-tipos">
              {tipos.map((t) => <span key={t}>{t}</span>)}
            </span>
          </div>
          {compacta && <TrajetoDoArquivo zona={caixa} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type TipoVisual = "pdf" | "word" | "slides" | "planilha" | "imagem" | "texto" | "codigo";

function tipoVisual(nome: string, imagem: boolean): TipoVisual {
  if (imagem) return "imagem";
  const e = nome.toLowerCase().split(".").pop() ?? "";
  if (e === "pdf") return "pdf";
  if (["docx", "odt", "rtf"].includes(e)) return "word";
  if (["pptx", "odp"].includes(e)) return "slides";
  if (["xlsx", "ods", "csv", "tsv"].includes(e)) return "planilha";
  if (["md", "txt", "log", "json"].includes(e)) return "texto";
  return "codigo";
}

function IconeDoTipo({ tipo }: { tipo: TipoVisual }) {
  if (tipo === "imagem") return <ImagemIcone size={18} />;
  if (tipo === "slides") return <Presentation size={18} />;
  if (tipo === "planilha") return <FileSpreadsheet size={18} />;
  if (tipo === "codigo") return <FileCode2 size={18} />;
  return <FileText size={18} />;
}

function IconeAnexo({ a }: { a: AnexoEmAndamento }) {
  if (a.pronto?.anexo.imagem) return <img src={a.pronto.anexo.imagem} alt="" className="anexo-miniatura" />;
  return <IconeDoTipo tipo={tipoVisual(a.nome, a.tipo === "imagem")} />;
}

export function ChipsAnexos({ lista, agente, aoRemover }: { lista: AnexoEmAndamento[]; agente: AgenteId; aoRemover: (id: string) => void }) {
  if (lista.length === 0) return null;
  return (
    <div className="anexos-chips">
      <AnimatePresence initial={false}>
        {lista.map((a) => (
          <motion.div
            key={a.id}
            layout
            className="anexo-chip"
            data-pronto={a.pronto ? "sim" : "nao"}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", visualDuration: 0.32, bounce: 0.35 } }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
          >
            <span className="anexo-icone" data-tipo={tipoVisual(a.nome, a.tipo === "imagem")}><IconeAnexo a={a} /></span>
            <span className="anexo-info">
              <span className="anexo-nome cortar">{a.nome}</span>
              {a.pronto ? (
                <span className="anexo-sub">{T.chat.anexos.tiposVisuais[tipoVisual(a.nome, a.tipo === "imagem")]} . {formatarTamanho(a.tamanho)}</span>
              ) : (
                <span className="anexo-barra">
                  <motion.span className="anexo-barra-cheia" style={{ width: `${Math.round(a.progresso * 100)}%` }} />
                  <span className="anexo-viajante" style={{ left: `${Math.round(a.progresso * 100)}%` }}>
                    <Personagem agente={agente} estado="escrevendo" tamanho={16} interativo={false} halo={false} olhar={false} />
                  </span>
                </span>
              )}
            </span>
            {a.pronto ? (
              <motion.span className="anexo-ok" initial={{ scale: 0 }} animate={{ scale: [0, 1.25, 1] }} transition={{ duration: 0.3 }}>
                <Check size={11} strokeWidth={3} />
              </motion.span>
            ) : (
              <span className="anexo-pct">{Math.round(a.progresso * 100)}%</span>
            )}
            <button type="button" className="anexo-remover" aria-label={T.chat.anexos.remover(a.nome)} title={T.chat.anexos.remover(a.nome)} onClick={() => aoRemover(a.id)}>
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function AnexosDaMensagem({ anexos }: { anexos?: { nome: string; tamanho: number; imagem?: string; texto?: string }[] }) {
  if (!anexos?.length) return null;
  return (
    <div className="anexos-mensagem">
      {anexos.map((a) => (
        <span key={a.nome} className="anexo-chip anexo-chip-enviado" title={a.nome}>
          <span className="anexo-icone" data-tipo={tipoVisual(a.nome, Boolean(a.imagem))}>{a.imagem ? <img src={a.imagem} alt="" className="anexo-miniatura" /> : <IconeDoTipo tipo={tipoVisual(a.nome, false)} />}</span>
          <span className="anexo-info">
            <span className="anexo-nome cortar">{a.nome}</span>
            <span className="anexo-sub">{T.chat.anexos.tiposVisuais[tipoVisual(a.nome, Boolean(a.imagem))]} . {formatarTamanho(a.tamanho)}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

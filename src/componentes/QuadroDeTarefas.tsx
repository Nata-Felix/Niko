import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { BookOpen, ChevronLeft, ChevronRight, CircleAlert, Clock, Flag, ListChecks, Pencil, Target, Timer, Trash2, Undo2 } from "lucide-react";
import { useRotina } from "../estado/rotina";
import { useInterface } from "../estado/interface";
import { useOrganizacao } from "../estado/organizacao";
import { useEstudos } from "../estado/estudos";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";
import { formatar, hojeISO } from "../utilitarios/datas";
import { COLUNAS_DO_QUADRO, colunaDaTarefa, colunaVizinha, detalhesDoCartao, ordenarCartoes, progressoDoQuadro, type ColunaDoQuadro, type DetalhesDoCartao } from "../utilitarios/quadroDeTarefas";
import type { Tarefa } from "../tipos";
import "./quadroDeTarefas.css";

const Q = T.ilha.quadro;

type Variante = "ilha" | "sistema";

interface Props {
  tarefas: Tarefa[];
  variante: Variante;
  mostrarData?: boolean;
  semMeta?: boolean;
  aoAbrir?: (tarefa: Tarefa) => void;
}

function agoraHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Chips({ detalhes, semMeta }: { detalhes: DetalhesDoCartao; semMeta?: boolean }) {
  const itens = [
    detalhes.atrasada && <span key="atraso" className="qt-chip qt-chip-atraso" title={Q.atrasada}><CircleAlert size={10} />{Q.atrasada}</span>,
    detalhes.prioridade === "alta" && <span key="prioridade" className="qt-chip qt-chip-alta" title={Q.prioridades.alta} aria-label={Q.prioridades.alta}><Flag size={10} /></span>,
    detalhes.data && <span key="data" className="qt-chip numero">{formatar(detalhes.data, "d/MM")}</span>,
    detalhes.hora && <span key="hora" className="qt-chip numero"><Clock size={10} />{detalhes.hora}</span>,
    detalhes.checklist && (
      <span key="checklist" className="qt-chip numero" data-completo={detalhes.checklist.feitos === detalhes.checklist.total || undefined} title={Q.checklist(detalhes.checklist.feitos, detalhes.checklist.total)}>
        <ListChecks size={10} />{detalhes.checklist.feitos}/{detalhes.checklist.total}
      </span>
    ),
    detalhes.pomodoros && <span key="pomodoros" className="qt-chip numero" title={Q.pomodoros(detalhes.pomodoros)}><Timer size={10} />{detalhes.pomodoros}</span>,
    !semMeta && detalhes.meta && <span key="meta" className="qt-chip qt-chip-ligacao" title={Q.meta(detalhes.meta)}><Target size={10} /><span className="qt-chip-texto">{detalhes.meta}</span></span>,
    detalhes.materia && <span key="materia" className="qt-chip qt-chip-ligacao" title={Q.materia(detalhes.materia)}><BookOpen size={10} /><span className="qt-chip-texto">{detalhes.materia}</span></span>,
  ].filter(Boolean);
  return itens.length ? <span className="qt-chips">{itens}</span> : null;
}

interface Excluida {
  tarefa: Tarefa;
  coluna: ColunaDoQuadro;
}

const TEMPO_PARA_DESFAZER = 5000;

function Cartao({ tarefa, detalhes, semMeta, aoMover, aoAbrir, aoExcluir }: { tarefa: Tarefa; detalhes: DetalhesDoCartao; semMeta?: boolean; aoMover: (t: Tarefa, c: ColunaDoQuadro) => void; aoAbrir?: (t: Tarefa) => void; aoExcluir: (t: Tarefa) => void }) {
  const atualizar = useRotina((s) => s.atualizarTarefa);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: tarefa.id, disabled: editando });
  const coluna = colunaDaTarefa(tarefa);
  const anterior = colunaVizinha(coluna, -1);
  const proxima = colunaVizinha(coluna, 1);
  const rotulo = aoAbrir ? `${tarefa.titulo}. ${Q.abrir}` : proxima ? T.ilha.moverCartao(tarefa.titulo, T.ilha.colunasQuadro[proxima]) : tarefa.titulo;

  const salvarTitulo = () => {
    const limpo = titulo.trim();
    if (limpo && limpo !== tarefa.titulo) atualizar(tarefa.id, { titulo: limpo.slice(0, 200) });
    else setTitulo(tarefa.titulo);
    setEditando(false);
  };

  return (
    <div ref={setNodeRef} className="qt-cartao" data-coluna={coluna} data-prioridade={tarefa.prioridade} data-atrasada={detalhes.atrasada || undefined} data-arrastando={isDragging || undefined} data-editando={editando || undefined}>
      {editando ? (
        <span className="qt-cartao-corpo">
          <input
            className="qt-cartao-campo privado"
            value={titulo}
            autoFocus
            maxLength={200}
            aria-label={T.geral.editar}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvarTitulo();
              if (e.key === "Escape") {
                e.stopPropagation();
                setTitulo(tarefa.titulo);
                setEditando(false);
              }
            }}
          />
        </span>
      ) : (
        <button
          type="button"
          className="qt-cartao-corpo privado"
          aria-label={rotulo}
          title={rotulo}
          {...attributes}
          {...listeners}
          onClick={() => (aoAbrir ? aoAbrir(tarefa) : proxima && aoMover(tarefa, proxima))}
          onKeyDown={(e) => {
            if (e.key === "F2") setEditando(true);
            else listeners?.onKeyDown?.(e);
          }}
        >
          <span className="qt-cartao-titulo">{tarefa.titulo}</span>
          <Chips detalhes={detalhes} semMeta={semMeta} />
        </button>
      )}
      {!editando && (
        <span className="qt-cartao-acoes">
          {anterior && (
            <button type="button" className="qt-acao" aria-label={Q.voltarPara(T.ilha.colunasQuadro[anterior])} title={Q.voltarPara(T.ilha.colunasQuadro[anterior])} onPointerDown={(e) => e.stopPropagation()} onClick={() => aoMover(tarefa, anterior)}>
              <ChevronLeft size={13} />
            </button>
          )}
          {proxima && (
            <button type="button" className="qt-acao" aria-label={Q.avancarPara(T.ilha.colunasQuadro[proxima])} title={Q.avancarPara(T.ilha.colunasQuadro[proxima])} onPointerDown={(e) => e.stopPropagation()} onClick={() => aoMover(tarefa, proxima)}>
              <ChevronRight size={13} />
            </button>
          )}
          <span className="qt-acoes-divisor" aria-hidden="true" />
          <button type="button" className="qt-acao" aria-label={T.geral.editar} title={T.geral.editar} onPointerDown={(e) => e.stopPropagation()} onClick={() => { setTitulo(tarefa.titulo); setEditando(true); }}>
            <Pencil size={12} />
          </button>
          <button type="button" className="qt-acao qt-acao-excluir" aria-label={T.geral.excluir} title={T.geral.excluir} onPointerDown={(e) => e.stopPropagation()} onClick={() => aoExcluir(tarefa)}>
            <Trash2 size={12} />
          </button>
        </span>
      )}
    </div>
  );
}

function Coluna({ id, tarefas, excluidas, detalhes, semMeta, aoMover, aoAbrir, aoExcluir, aoDesfazer }: { id: ColunaDoQuadro; tarefas: Tarefa[]; excluidas: Excluida[]; detalhes: Map<string, DetalhesDoCartao>; semMeta?: boolean; aoMover: (t: Tarefa, c: ColunaDoQuadro) => void; aoAbrir?: (t: Tarefa) => void; aoExcluir: (t: Tarefa) => void; aoDesfazer: (e: Excluida) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className="qt-coluna" data-coluna={id} data-sobre={isOver || undefined} aria-label={`${T.ilha.colunasQuadro[id]}, ${tarefas.length}`}>
      <header className="qt-coluna-cabeca">
        <span className="qt-coluna-ponto" aria-hidden="true" />
        <span className="qt-coluna-nome">{T.ilha.colunasQuadro[id]}</span>
        <span className="qt-coluna-numero numero">{tarefas.length}</span>
      </header>
      <div className="qt-cartoes">
        {tarefas.map((t) => <Cartao key={t.id} tarefa={t} detalhes={detalhes.get(t.id)!} semMeta={semMeta} aoMover={aoMover} aoAbrir={aoAbrir} aoExcluir={aoExcluir} />)}
        {excluidas.map((e) => (
          <div key={e.tarefa.id} className="qt-excluida" role="status">
            <span className="qt-excluida-texto">{Q.excluida}</span>
            <button type="button" className="qt-excluida-desfazer" onClick={() => aoDesfazer(e)}>
              <Undo2 size={12} />
              {T.geral.desfazer}
            </button>
          </div>
        ))}
        {tarefas.length === 0 && excluidas.length === 0 && <span className="qt-vazio">{isOver ? T.ilha.arrasteAqui : Q.vazioColuna}</span>}
      </div>
    </section>
  );
}

export function QuadroDeTarefas({ tarefas, variante, mostrarData, semMeta, aoAbrir }: Props) {
  const mudarStatus = useRotina((s) => s.mudarStatus);
  const metas = useOrganizacao((s) => s.metas);
  const materias = useEstudos((s) => s.materias);
  const excluir = useRotina((s) => s.excluirTarefa);
  const restaurar = useRotina((s) => s.restaurarTarefa);
  const avisar = useInterface((s) => s.avisar);
  const [excluidas, setExcluidas] = useState<Excluida[]>([]);
  const [arrastando, setArrastando] = useState<Tarefa | null>(null);
  const [cores, setCores] = useState<CSSProperties>({});
  const quadro = useRef<HTMLDivElement>(null);
  const acabouDeArrastar = useRef(false);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const visiveis = tarefas.filter((t) => t.status !== "cancelada");
  const contexto = { metas, materias, hoje: hojeISO(), agoraHHMM: agoraHHMM(), mostrarData };
  const detalhes = new Map(visiveis.map((t) => [t.id, detalhesDoCartao(t, contexto)]));
  const progresso = progressoDoQuadro(visiveis);

  const mover = (t: Tarefa, c: ColunaDoQuadro) => {
    if (acabouDeArrastar.current || colunaDaTarefa(t) === c) return;
    mudarStatus(t.id, c);
    void tocarSom(c === "concluida" ? "finish" : "blip", c === "concluida" ? "personagens" : undefined);
  };

  const aoComecar = (e: DragStartEvent) => {
    // O cartão flutuante sai da ilha, então leva junto as cores da borda.
    const estilo = variante === "ilha" && quadro.current ? getComputedStyle(quadro.current) : null;
    if (estilo) setCores({ "--borda-rgb": estilo.getPropertyValue("--borda-rgb"), "--borda-fundo-solido": estilo.getPropertyValue("--borda-fundo-solido") } as CSSProperties);
    setArrastando(visiveis.find((t) => t.id === e.active.id) ?? null);
  };

  const aoSoltar = (e: DragEndEvent) => {
    setArrastando(null);
    const tarefa = visiveis.find((t) => t.id === e.active.id);
    const destino = COLUNAS_DO_QUADRO.find((c) => c === e.over?.id);
    if (tarefa && destino) mover(tarefa, destino);
    // O clique que encerra o arraste não deve mover nem abrir o cartão.
    acabouDeArrastar.current = true;
    window.setTimeout(() => (acabouDeArrastar.current = false), 0);
  };

  const abrir = aoAbrir ? (t: Tarefa) => { if (!acabouDeArrastar.current) aoAbrir(t); } : undefined;

  useEffect(() => {
    if (!excluidas.length) return;
    const id = window.setTimeout(() => setExcluidas((lista) => lista.slice(1)), TEMPO_PARA_DESFAZER);
    return () => window.clearTimeout(id);
  }, [excluidas]);

  const apagar = (t: Tarefa) => {
    const removida = excluir(t.id);
    if (!removida) return;
    if (variante === "sistema") avisar(T.geral.excluido, () => restaurar(removida));
    else setExcluidas((lista) => [...lista, { tarefa: removida, coluna: colunaDaTarefa(removida) }]);
  };

  const desfazer = (e: Excluida) => {
    restaurar(e.tarefa);
    setExcluidas((lista) => lista.filter((x) => x.tarefa.id !== e.tarefa.id));
  };

  return (
    <DndContext sensors={sensores} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
      <div ref={quadro} className="qt" data-variante={variante}>
        {progresso.total > 0 && (
          <div className="qt-progresso" title={Q.dicaDeUso}>
            <span className="qt-progresso-trilho" aria-hidden="true">
              <span style={{ width: `${(progresso.feitas / progresso.total) * 100}%` }} />
            </span>
            <span className="qt-progresso-texto numero">{Q.progresso(progresso.feitas, progresso.total)}</span>
          </div>
        )}
        <div className="qt-colunas">
          {COLUNAS_DO_QUADRO.map((c) => (
            <Coluna key={c} id={c} tarefas={ordenarCartoes(visiveis.filter((t) => colunaDaTarefa(t) === c), c)} excluidas={excluidas.filter((e) => e.coluna === c)} detalhes={detalhes} semMeta={semMeta} aoMover={mover} aoAbrir={abrir} aoExcluir={apagar} aoDesfazer={desfazer} />
          ))}
        </div>
      </div>
      {/* A raiz da ilha usa transform, que deslocaria o cartão fixo; por isso ele flutua direto no body. */}
      {createPortal(
        <DragOverlay dropAnimation={null} className={variante === "ilha" ? "qt-flutuante qt-flutuante-ilha" : "qt-flutuante estilo-sistema"} style={cores}>
          {arrastando && (
            <div className="qt" data-variante={variante}>
              <div className="qt-cartao" data-coluna={colunaDaTarefa(arrastando)} data-prioridade={arrastando.prioridade} data-flutuando="sim">
                <span className="qt-cartao-corpo privado">
                  <span className="qt-cartao-titulo">{arrastando.titulo}</span>
                  {detalhes.get(arrastando.id) && <Chips detalhes={detalhes.get(arrastando.id)!} semMeta={semMeta} />}
                </span>
              </div>
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useRotina } from "../../estado/rotina";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";
import type { Tarefa } from "../../tipos";

type Coluna = keyof typeof T.ilha.colunasQuadro;
const COLUNAS: Coluna[] = ["a_fazer", "em_andamento", "concluida"];

// Reagendada e em aguardo ainda são pendências, então ficam em "A fazer".
export function colunaDaTarefa(t: Tarefa): Coluna {
  return t.status === "em_andamento" || t.status === "concluida" ? t.status : "a_fazer";
}

function seguinte(c: Coluna): Coluna {
  return COLUNAS[(COLUNAS.indexOf(c) + 1) % COLUNAS.length];
}

function ConteudoDoCartao({ tarefa }: { tarefa: Tarefa }) {
  return (
    <>
      <span className="ilha-quadro-titulo">{tarefa.titulo}</span>
      {tarefa.hora && <span className="ilha-mini numero">{tarefa.hora}</span>}
    </>
  );
}

function Cartao({ tarefa, aoMover }: { tarefa: Tarefa; aoMover: (t: Tarefa, c: Coluna) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: tarefa.id });
  const coluna = colunaDaTarefa(tarefa);
  const destino = seguinte(coluna);
  const rotulo = T.ilha.moverCartao(tarefa.titulo, T.ilha.colunasQuadro[destino]);
  return (
    <button
      ref={setNodeRef}
      type="button"
      className="ilha-quadro-cartao privado"
      data-coluna={coluna}
      data-arrastando={isDragging ? "sim" : undefined}
      aria-label={rotulo}
      title={rotulo}
      {...attributes}
      {...listeners}
      onClick={() => aoMover(tarefa, destino)}
    >
      <ConteudoDoCartao tarefa={tarefa} />
    </button>
  );
}

function ColunaDoQuadro({ id, tarefas, aoMover }: { id: Coluna; tarefas: Tarefa[]; aoMover: (t: Tarefa, c: Coluna) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="ilha-quadro-coluna" data-coluna={id} data-sobre={isOver ? "sim" : undefined}>
      <span className="ilha-quadro-cabeca">
        <span>{T.ilha.colunasQuadro[id]}</span>
        <span className="ilha-chip-numero numero">{tarefas.length}</span>
      </span>
      <div className="ilha-quadro-cartoes">
        {tarefas.length === 0 ? <span className="ilha-quadro-vazio">{T.ilha.arrasteAqui}</span> : tarefas.map((t) => <Cartao key={t.id} tarefa={t} aoMover={aoMover} />)}
      </div>
    </div>
  );
}

export function QuadroDeTarefas({ tarefas }: { tarefas: Tarefa[] }) {
  const mudarStatus = useRotina((s) => s.mudarStatus);
  const [arrastando, setArrastando] = useState<Tarefa | null>(null);
  const [cores, setCores] = useState<CSSProperties>({});
  const quadro = useRef<HTMLDivElement>(null);
  const acabouDeArrastar = useRef(false);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const mover = (t: Tarefa, c: Coluna) => {
    if (acabouDeArrastar.current || colunaDaTarefa(t) === c) return;
    mudarStatus(t.id, c);
    void tocarSom(c === "concluida" ? "finish" : "blip", c === "concluida" ? "personagens" : undefined);
  };

  const aoComecar = (e: DragStartEvent) => {
    // O cartão flutuante sai da ilha, então leva junto as cores da borda.
    const estilo = quadro.current ? getComputedStyle(quadro.current) : null;
    if (estilo) setCores({ "--borda-rgb": estilo.getPropertyValue("--borda-rgb"), "--borda-fundo-solido": estilo.getPropertyValue("--borda-fundo-solido") } as CSSProperties);
    setArrastando(tarefas.find((t) => t.id === e.active.id) ?? null);
  };

  const aoSoltar = (e: DragEndEvent) => {
    setArrastando(null);
    const tarefa = tarefas.find((t) => t.id === e.active.id);
    const destino = COLUNAS.find((c) => c === e.over?.id);
    if (tarefa && destino) mover(tarefa, destino);
    // O clique que encerra o arraste não deve mover o cartão de novo.
    acabouDeArrastar.current = true;
    window.setTimeout(() => (acabouDeArrastar.current = false), 0);
  };

  return (
    <DndContext sensors={sensores} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
      <div ref={quadro} className="ilha-quadro">
        {COLUNAS.map((c) => (
          <ColunaDoQuadro key={c} id={c} tarefas={tarefas.filter((t) => colunaDaTarefa(t) === c)} aoMover={mover} />
        ))}
      </div>
      {/* A raiz da ilha usa transform, que deslocaria o cartão fixo; por isso ele flutua direto no body. */}
      {createPortal(
        <DragOverlay dropAnimation={null} className="ilha-quadro-flutuante" style={cores}>
          {arrastando && (
            <div className="ilha-quadro-cartao privado" data-coluna={colunaDaTarefa(arrastando)} data-flutuando="sim">
              <ConteudoDoCartao tarefa={arrastando} />
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

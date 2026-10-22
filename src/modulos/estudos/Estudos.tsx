import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  Plus, FileText, Kanban, CalendarClock, Layers, Link2, ChartColumn, Trash2, CheckCircle2, GraduationCap, Pencil, BookCheck, Flag, ListChecks, Timer, Folder, FolderPlus, Ellipsis, Search, NotebookPen, Play, Pause, Check, Globe, ArrowUpRight,
} from "lucide-react";
import { addDays } from "date-fns";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Botao, Campo, Modal, Vazio, ConfirmarModal, CaixaMarcar, Pilulas } from "../../componentes/basicos";
import { Paginacao, usarPaginacao } from "../../componentes/Paginacao";
import { Editor } from "../../componentes/Editor";
import { useEstudos, cartoesVencidos, revisoesParaHoje, previsaoIntervalos, descreverIntervalo } from "../../estado/estudos";
import { useRotina } from "../../estado/rotina";
import { usePomodoro } from "../../estado/pomodoro";
import { useInterface } from "../../estado/interface";
import { useAgentes } from "../../estado/agentes";
import { T } from "../../textos/textos";
import { dataValida, descreverDistancia, diasAte, formatar, hojeISO, paraISO } from "../../utilitarios/datas";
import { gerarId, urlSegura } from "../../utilitarios/basicos";
import { minutosEstudoPorDia, sequenciaDias } from "../../utilitarios/estatisticas";
import { tocarSom } from "../../ponte/sons";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import { excluirArquivosDaMateria } from "../../ponte/arquivos";
import { Arquivos } from "./Arquivos";
import type { DataImportante, EstadoLink, Materia, Prioridade, Tarefa, TipoArea, TipoDataImportante } from "../../tipos";

type Aba = keyof typeof T.estudos.abas;

const ICONES_ABA: Record<Aba, React.ReactNode> = {
  anotacoes: <NotebookPen size={13} />,
  quadro: <Kanban size={13} />,
  datas: <CalendarClock size={13} />,
  revisoes: <Layers size={13} />,
  links: <Link2 size={13} />,
  arquivos: <Folder size={13} />,
  estatisticas: <ChartColumn size={13} />,
};

const ABAS_MATERIA: Aba[] = ["anotacoes", "quadro", "datas", "revisoes", "links", "arquivos", "estatisticas"];
const ABAS_GERAIS: Aba[] = ["estatisticas", "revisoes", "links"];
const ABAS_QUE_SEGUEM_A_MATERIA: Aba[] = ["anotacoes", "quadro", "datas", "arquivos"];

function fimDeHoje(dias = 0) {
  const d = addDays(new Date(), dias);
  d.setHours(23, 59, 59, 999);
  return d;
}

function minutosDeFoco(sessoes: ReturnType<typeof usePomodoro.getState>["sessoes"], materiaId?: string) {
  return sessoes.filter((x) => x.etapa === "foco" && x.situacao === "concluida" && (materiaId ? x.materiaId === materiaId : !!x.materiaId)).reduce((a, x) => a + x.minutos, 0);
}

function proximaData(datas: DataImportante[], materiaId: string) {
  const hoje = hojeISO();
  return datas.filter((d) => d.materiaId === materiaId && !d.concluida && d.data >= hoje).sort((x, y) => x.data.localeCompare(y.data))[0];
}

function NovaArea({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const criarArea = useEstudos((s) => s.criarArea);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoArea>("faculdade");
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (aberto) {
      setNome("");
      setErro("");
    }
  }, [aberto]);
  return (
    <Modal aberto={aberto} titulo={T.estudos.novaArea} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!nome.trim()) return setErro(T.validacao.obrigatorio);
          criarArea(nome, tipo);
          aoFechar();
        }}
      >
        <Campo id="a-nome" rotulo={T.estudos.nomeArea} obrigatorio erro={erro}>
          <input id="a-nome" className="campo" value={nome} maxLength={60} aria-invalid={!!erro} onChange={(e) => { setNome(e.target.value); setErro(""); }} />
        </Campo>
        <Campo id="a-tipo" rotulo={T.estudos.tipoArea} dica={T.estudos.colunasDica}>
          <select id="a-tipo" className="seletor" value={tipo} onChange={(e) => setTipo(e.target.value as TipoArea)}>
            {(Object.keys(T.estudos.tipos) as TipoArea[]).map((t) => <option key={t} value={t}>{T.estudos.tipos[t]}</option>)}
          </select>
        </Campo>
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function NovaMateria({ areaId, aberto, aoFechar, aoCriar }: { areaId?: string; aberto: boolean; aoFechar: () => void; aoCriar: (m: Materia) => void }) {
  const areas = useEstudos((s) => s.areas);
  const criar = useEstudos((s) => s.criarMateria);
  const [nome, setNome] = useState("");
  const [area, setArea] = useState(areaId ?? "");
  const [semestre, setSemestre] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (aberto) {
      setNome("");
      setSemestre("");
      setArea(areaId ?? areas[0]?.id ?? "");
      setErros({});
    }
  }, [aberto, areaId, areas]);
  const tipo = areas.find((a) => a.id === area)?.tipo;
  return (
    <Modal aberto={aberto} titulo={T.estudos.novaMateria} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
          if (!area) novos.area = T.validacao.obrigatorio;
          setErros(novos);
          if (Object.keys(novos).length) return;
          aoCriar(criar(area, nome, semestre.trim() || undefined));
          aoFechar();
        }}
      >
        <Campo id="m-nome" rotulo={T.estudos.nomeMateria} obrigatorio erro={erros.nome}>
          <input id="m-nome" className="campo" value={nome} maxLength={80} aria-invalid={!!erros.nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo id="m-area" rotulo={T.estudos.areas} obrigatorio erro={erros.area}>
          <select id="m-area" className="seletor" value={area} onChange={(e) => setArea(e.target.value)}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </Campo>
        {tipo === "faculdade" && (
          <Campo id="m-sem" rotulo={T.estudos.semestre}>
            <input id="m-sem" className="campo" value={semestre} maxLength={12} placeholder="2026.2" onChange={(e) => setSemestre(e.target.value)} />
          </Campo>
        )}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function LadoDaMateria({ materia }: { materia: Materia }) {
  const datas = useEstudos((s) => s.datas);
  const cartoes = useEstudos((s) => s.cartoes).filter((c) => c.materiaId === materia.id);
  const links = useEstudos((s) => s.links).filter((l) => l.materiaId === materia.id).slice(0, 4);
  const hoje = hojeISO();
  const proximas = datas.filter((d) => d.materiaId === materia.id && !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 3);
  const ateHoje = cartoesVencidos(cartoes, fimDeHoje()).length;
  const ateAmanha = cartoesVencidos(cartoes, fimDeHoje(1)).length;
  const ateSemana = cartoesVencidos(cartoes, fimDeHoje(7)).length;
  const janelas = [
    { chave: "hoje", valor: ateHoje },
    { chave: "amanha", valor: ateAmanha - ateHoje },
    { chave: "semana", valor: ateSemana - ateAmanha },
  ] as const;

  return (
    <aside className="est-anotacoes-lado">
      <div className="est-lado-bloco">
        <span className="est-rotulo">{T.estudos.abas.datas}</span>
        {proximas.length === 0 && <span className="est-lado-vazio">{T.estudos.semDatas}</span>}
        {proximas.map((d) => (
          <div key={d.id} className="est-lado-data" data-perto={diasAte(d.data) <= 7 ? "sim" : "nao"}>
            <span className="est-lado-data-titulo">{d.titulo}</span>
            <span className="est-lado-data-quando">{formatar(d.data, "d MMM")} · {descreverDistancia(d.data)}</span>
          </div>
        ))}
      </div>
      <div className="est-lado-bloco">
        <span className="est-rotulo">{T.estudos.revisaoEspacada}</span>
        <div className="est-lado-revisoes">
          {janelas.map((j) => (
            <span key={j.chave} className="est-lado-revisao" data-janela={j.chave} data-ativa={j.valor > 0 ? "sim" : "nao"}>{j.valor}</span>
          ))}
        </div>
        <div className="est-lado-revisoes-rotulos">
          {janelas.map((j) => <span key={j.chave}>{T.estudos.janelasRevisao[j.chave]}</span>)}
        </div>
      </div>
      <div className="est-lado-bloco">
        <span className="est-rotulo">{T.estudos.abas.links}</span>
        {links.length === 0 && <span className="est-lado-vazio">{T.estudos.semLinks}</span>}
        {links.map((l) => (
          <a key={l.id} className="est-lado-link" href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
            <Link2 size={12} />
            <span className="cortar">{l.titulo}</span>
          </a>
        ))}
      </div>
    </aside>
  );
}

function Anotacoes({ materia, paginaInicial }: { materia: Materia; paginaInicial?: string }) {
  const paginas = useEstudos((s) => s.paginas).filter((p) => p.materiaId === materia.id);
  const criar = useEstudos((s) => s.criarPagina);
  const atualizar = useEstudos((s) => s.atualizarPagina);
  const excluir = useEstudos((s) => s.excluirPagina);
  const marcarEstudada = useEstudos((s) => s.marcarEstudada);
  const desmarcarEstudada = useEstudos((s) => s.desmarcarEstudada);
  const avisar = useInterface((s) => s.avisar);
  const [atual, setAtual] = useState<string | undefined>(paginaInicial ?? paginas[0]?.id);
  const [confirmar, setConfirmar] = useState(false);
  const pagina = paginas.find((p) => p.id === atual) ?? paginas[0];

  useEffect(() => {
    if (paginaInicial) setAtual(paginaInicial);
  }, [paginaInicial]);

  const arvore = (paiId: string | undefined, nivel: number): React.ReactNode =>
    paginas
      .filter((p) => p.paiId === paiId)
      .map((p) => (
        <div key={p.id} className="est-paginas-grupo">
          <button type="button" className="est-pagina-item" aria-current={pagina?.id === p.id} style={{ paddingLeft: 8 + nivel * 14 }} onClick={() => setAtual(p.id)}>
            <FileText size={13} />
            <span className="cortar">{p.titulo || T.estudos.semTitulo}</span>
            {p.estudadaEm && <BookCheck size={12} className="est-pagina-estudada" />}
          </button>
          {arvore(p.id, nivel + 1)}
        </div>
      ));

  return (
    <div className="est-anotacoes">
      <nav className="est-paginas" aria-label={T.estudos.paginas}>
        <span className="est-rotulo est-paginas-rotulo">{T.estudos.paginas}</span>
        {arvore(undefined, 0)}
        <button type="button" className="est-tracejado est-paginas-nova" onClick={() => setAtual(criar(materia.id).id)}>
          <Plus size={12} />
          {T.estudos.novaPagina}
        </button>
      </nav>
      <div className="est-anotacoes-centro">
        {!pagina ? (
          <Vazio icone={<FileText size={28} />} titulo={T.estudos.semPaginas} acao={<Botao variante="primario" onClick={() => setAtual(criar(materia.id).id)}>{T.estudos.novaPagina}</Botao>} />
        ) : (
          <>
            <div className="est-pagina-cabecalho">
              <input
                key={pagina.id}
                className="est-pagina-titulo"
                defaultValue={pagina.titulo}
                maxLength={120}
                placeholder={T.estudos.semTitulo}
                aria-label={T.estudos.tituloPagina}
                onBlur={(e) => e.target.value !== pagina.titulo && atualizar(pagina.id, { titulo: e.target.value.trim() })}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
              <div className="est-pagina-acoes">
                {pagina.estudadaEm && <span className="est-pagina-dica">{T.estudos.estudadaEm(formatar(pagina.estudadaEm, "d/MM"))}</span>}
                <Botao pequeno icone={<Plus size={12} />} onClick={() => setAtual(criar(materia.id, pagina.id).id)}>{T.estudos.subpagina}</Botao>
                <Botao
                  pequeno
                  variante={pagina.estudadaEm ? "secundario" : "primario"}
                  icone={<BookCheck size={12} />}
                  onClick={() => {
                    if (pagina.estudadaEm) {
                      desmarcarEstudada(pagina.id);
                      avisar(T.estudos.estudadaDesmarcada);
                      return;
                    }
                    marcarEstudada(pagina.id);
                    void tocarSom("proud", "personagens");
                    void useAgentes.getState().trabalhar("tutor", T.estudos.revisoesAgendadas, 400);
                  }}
                >
                  {pagina.estudadaEm ? T.estudos.desmarcarEstudada : T.estudos.marcarEstudada}
                </Botao>
                <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} title={T.geral.excluir} onClick={() => setConfirmar(true)} />
              </div>
            </div>
            <Editor chave={pagina.id} conteudo={pagina.conteudo} aoMudar={(html) => atualizar(pagina.id, { conteudo: html })} placeholder={T.estudos.paginaVazia} />
            <ConfirmarModal
              aberto={confirmar}
              titulo={T.geral.confirmarExclusao}
              texto={T.estudos.excluirPagina}
              aoFechar={() => setConfirmar(false)}
              aoConfirmar={() => {
                excluir(pagina.id);
                setAtual(undefined);
              }}
            />
          </>
        )}
      </div>
      <LadoDaMateria materia={materia} />
    </div>
  );
}

function CartaoKanban({ tarefa, aoAbrir }: { tarefa: Tarefa; aoAbrir: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: tarefa.id });
  const feitos = tarefa.checklist.filter((c) => c.feito).length;
  const concluida = tarefa.status === "concluida";
  return (
    <div
      ref={setNodeRef}
      className="est-cartao"
      data-arrastando={isDragging ? "sim" : "nao"}
      style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}
      {...attributes}
      {...listeners}
      onClick={aoAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter") aoAbrir();
        listeners?.onKeyDown?.(e);
      }}
    >
      <span className={`est-cartao-titulo ${concluida ? "riscado" : ""}`}>{tarefa.titulo}</span>
      <span className="est-cartao-meta">
        {tarefa.prioridade === "alta" && <span className="est-cartao-urgente"><Flag size={11} />{T.prioridade.alta}</span>}
        {tarefa.data && <span data-perto={!concluida && diasAte(tarefa.data) <= 3 ? "sim" : "nao"}><CalendarClock size={11} />{descreverDistancia(tarefa.data)}</span>}
        {tarefa.estimativaPomodoros ? <span title={T.estudos.estimativa}><Timer size={11} />{tarefa.estimativaPomodoros}</span> : null}
        {tarefa.checklist.length > 0 && <span title={T.estudos.checklist}><ListChecks size={11} />{feitos}/{tarefa.checklist.length}</span>}
      </span>
    </div>
  );
}

function ColunaKanban({ id, nome, cor, quantidade, children, aoNovo, aoRenomear, aoExcluir }: { id: string; nome: string; cor: string; quantidade: number; children: React.ReactNode; aoNovo: () => void; aoRenomear: () => void; aoExcluir?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="est-coluna" data-sobre={isOver ? "sim" : "nao"}>
      <div className="est-coluna-topo">
        <span className="est-coluna-nome">
          <span className="est-coluna-ponto" style={{ background: cor }} />
          <span className="cortar">{nome}</span>
        </span>
        <span className="est-coluna-acoes">
          <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={12} />} aria-label={T.geral.editar} title={T.geral.editar} onClick={aoRenomear} />
          {aoExcluir && <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} title={T.geral.excluir} onClick={aoExcluir} />}
        </span>
        <span className="est-coluna-quantidade">{quantidade}</span>
      </div>
      {children}
      <button type="button" className="est-tracejado est-coluna-novo" onClick={aoNovo}>
        <Plus size={12} />
        {T.estudos.novoCartao}
      </button>
    </div>
  );
}

function EditarCartao({ tarefa, materia, aoFechar }: { tarefa: Tarefa | null; materia: Materia; aoFechar: () => void }) {
  const atualizar = useRotina((s) => s.atualizarTarefa);
  const excluir = useRotina((s) => s.excluirTarefa);
  const restaurar = useRotina((s) => s.restaurarTarefa);
  const avisar = useInterface((s) => s.avisar);
  const [dados, setDados] = useState<Tarefa | null>(tarefa);
  const [novoItem, setNovoItem] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    setDados(tarefa);
    setErros({});
    setNovoItem("");
  }, [tarefa]);
  if (!dados) return <Modal aberto={false} titulo="" aoFechar={aoFechar}>{null}</Modal>;

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (!dados.titulo.trim()) novos.titulo = T.validacao.obrigatorio;
    if (dados.data && !dataValida(dados.data)) novos.data = T.validacao.dataInvalida;
    if (dados.estimativaPomodoros != null && (dados.estimativaPomodoros < 0 || dados.estimativaPomodoros > 40)) novos.estimativa = T.validacao.entre(0, 40);
    setErros(novos);
    if (Object.keys(novos).length) return;
    const coluna = materia.colunas.find((c) => c.id === dados.colunaId);
    atualizar(dados.id, { ...dados, titulo: dados.titulo.trim(), status: coluna?.conclui ? "concluida" : dados.status === "concluida" ? "a_fazer" : dados.status });
    aoFechar();
  };

  return (
    <Modal aberto={!!tarefa} titulo={T.estudos.cartao} aoFechar={aoFechar} largo>
      <form className="formulario" onSubmit={salvar} noValidate>
        <Campo id="k-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={erros.titulo}>
          <input id="k-titulo" className="campo" value={dados.titulo} maxLength={200} aria-invalid={!!erros.titulo} onChange={(e) => setDados({ ...dados, titulo: e.target.value })} />
        </Campo>
        <Campo id="k-desc" rotulo={T.financas.descricao}>
          <textarea id="k-desc" className="area-texto" value={dados.descricao} maxLength={2000} onChange={(e) => setDados({ ...dados, descricao: e.target.value })} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="k-coluna" rotulo={T.estudos.coluna}>
            <select id="k-coluna" className="seletor" value={dados.colunaId ?? materia.colunas[0]?.id} onChange={(e) => setDados({ ...dados, colunaId: e.target.value })}>
              {materia.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo id="k-prazo" rotulo={T.estudos.prazo} erro={erros.data} dica={T.estudos.prazoDica}>
            <input id="k-prazo" type="date" className="campo" value={dados.data ?? ""} aria-invalid={!!erros.data} onChange={(e) => setDados({ ...dados, data: e.target.value || undefined })} />
          </Campo>
          <Campo id="k-prioridade" rotulo={T.estudos.prioridade}>
            <select id="k-prioridade" className="seletor" value={dados.prioridade} onChange={(e) => setDados({ ...dados, prioridade: e.target.value as Prioridade })}>
              {(Object.keys(T.prioridade) as Prioridade[]).map((p) => <option key={p} value={p}>{T.prioridade[p]}</option>)}
            </select>
          </Campo>
          <Campo id="k-est" rotulo={T.estudos.estimativa} erro={erros.estimativa}>
            <input id="k-est" className="campo" inputMode="numeric" value={dados.estimativaPomodoros ?? ""} aria-invalid={!!erros.estimativa} onChange={(e) => setDados({ ...dados, estimativaPomodoros: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : undefined })} />
          </Campo>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.estudos.checklist}</span>
          {dados.checklist.map((item) => (
            <div key={item.id} className="linha">
              <CaixaMarcar marcada={item.feito} rotulo={item.texto} aoMudar={(v) => setDados({ ...dados, checklist: dados.checklist.map((c) => (c.id === item.id ? { ...c, feito: v } : c)) })} />
              <span className={`cortar ${item.feito ? "riscado" : ""}`} style={{ flex: 1 }}>{item.texto}</span>
              <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={() => setDados({ ...dados, checklist: dados.checklist.filter((c) => c.id !== item.id) })} />
            </div>
          ))}
          <div className="linha">
            <input
              className="campo"
              value={novoItem}
              maxLength={120}
              placeholder={T.estudos.novoItem}
              aria-label={T.estudos.novoItem}
              onChange={(e) => setNovoItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!novoItem.trim()) return;
                  setDados({ ...dados, checklist: [...dados.checklist, { id: gerarId(), texto: novoItem.trim(), feito: false }] });
                  setNovoItem("");
                }
              }}
            />
          </div>
        </div>
        <div className="formulario-acoes" style={{ justifyContent: "space-between" }}>
          <Botao
            variante="perigo"
            icone={<Trash2 size={14} />}
            onClick={() => {
              const r = excluir(dados.id);
              if (r) avisar(T.geral.excluido, () => restaurar(r));
              aoFechar();
            }}
          >
            {T.geral.excluir}
          </Botao>
          <span className="linha">
            <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function corDaColuna(conclui: boolean, indice: number) {
  if (conclui) return "var(--sucesso)";
  return indice === 0 ? "var(--texto-3)" : "var(--alerta)";
}

function Quadro({ materia }: { materia: Materia }) {
  const tarefas = useRotina((s) => s.tarefas).filter((t) => t.materiaId === materia.id);
  const criar = useRotina((s) => s.criarTarefa);
  const atualizarTarefa = useRotina((s) => s.atualizarTarefa);
  const atualizarMateria = useEstudos((s) => s.atualizarMateria);
  const [aberta, setAberta] = useState<Tarefa | null>(null);
  const [renomear, setRenomear] = useState<{ id: string | null; nome: string; conclui: boolean } | null>(null);
  const [erroColuna, setErroColuna] = useState("");
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const primeira = materia.colunas[0]?.id;

  const aoSoltar = (e: DragEndEvent) => {
    if (!e.over) return;
    const coluna = materia.colunas.find((c) => c.id === e.over?.id);
    const tarefa = tarefas.find((t) => t.id === e.active.id);
    if (!coluna || !tarefa || (tarefa.colunaId ?? primeira) === coluna.id) return;
    atualizarTarefa(tarefa.id, {
      colunaId: coluna.id,
      status: coluna.conclui ? "concluida" : tarefa.status === "concluida" ? "a_fazer" : tarefa.status,
      concluidaEm: coluna.conclui ? new Date().toISOString() : undefined,
    });
    void tocarSom(coluna.conclui ? "finish" : "blip", coluna.conclui ? "personagens" : "interface");
  };

  const salvarColuna = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renomear) return;
    const nome = renomear.nome.trim();
    if (!nome) return setErroColuna(T.validacao.obrigatorio);
    const colunas = renomear.id
      ? materia.colunas.map((c) => (c.id === renomear.id ? { ...c, nome, conclui: renomear.conclui } : c))
      : [...materia.colunas, { id: gerarId(), nome, conclui: renomear.conclui }];
    atualizarMateria(materia.id, { colunas });
    setRenomear(null);
  };

  return (
    <div className="est-quadro">
      <div className="est-barra-topo">
        <span className="est-dica">{T.estudos.quadroDica}</span>
        <Botao pequeno icone={<Plus size={12} />} onClick={() => { setErroColuna(""); setRenomear({ id: null, nome: "", conclui: false }); }}>{T.estudos.novaColuna}</Botao>
      </div>
      <DndContext sensors={sensores} onDragEnd={aoSoltar}>
        <div className="est-colunas">
          {materia.colunas.map((c, i) => {
            const daColuna = tarefas.filter((t) => (t.colunaId ?? primeira) === c.id).sort((a, b) => a.ordem - b.ordem);
            return (
              <ColunaKanban
                key={c.id}
                id={c.id}
                nome={c.nome}
                cor={corDaColuna(c.conclui, i)}
                quantidade={daColuna.length}
                aoNovo={() => setAberta(criar({ titulo: T.estudos.novoCartao, materiaId: materia.id, colunaId: c.id, status: c.conclui ? "concluida" : "a_fazer" }))}
                aoRenomear={() => { setErroColuna(""); setRenomear({ id: c.id, nome: c.nome, conclui: c.conclui }); }}
                aoExcluir={
                  materia.colunas.length > 1
                    ? () => {
                        const destino = materia.colunas.find((x) => x.id !== c.id)!.id;
                        daColuna.forEach((t) => atualizarTarefa(t.id, { colunaId: destino }));
                        atualizarMateria(materia.id, { colunas: materia.colunas.filter((x) => x.id !== c.id) });
                      }
                    : undefined
                }
              >
                {daColuna.map((t) => <CartaoKanban key={t.id} tarefa={t} aoAbrir={() => setAberta(t)} />)}
              </ColunaKanban>
            );
          })}
        </div>
      </DndContext>
      <EditarCartao tarefa={aberta} materia={materia} aoFechar={() => setAberta(null)} />
      <Modal aberto={!!renomear} titulo={renomear?.id ? T.geral.editar : T.estudos.novaColuna} aoFechar={() => setRenomear(null)}>
        {renomear && (
          <form className="formulario" onSubmit={salvarColuna} noValidate>
            <Campo id="c-nome" rotulo={T.estudos.nomeColuna} obrigatorio erro={erroColuna}>
              <input id="c-nome" className="campo" value={renomear.nome} maxLength={40} onChange={(e) => { setRenomear({ ...renomear, nome: e.target.value }); setErroColuna(""); }} />
            </Campo>
            <label className="linha">
              <CaixaMarcar marcada={renomear.conclui} rotulo={T.estudos.colunaConclui} aoMudar={(v) => setRenomear({ ...renomear, conclui: v })} />
              <span>{T.estudos.colunaConclui}</span>
            </label>
            <div className="formulario-acoes">
              <Botao onClick={() => setRenomear(null)}>{T.geral.cancelar}</Botao>
              <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function NovaData({ materia, aberto, aoFechar }: { materia: Materia; aberto: boolean; aoFechar: () => void }) {
  const criar = useEstudos((s) => s.criarData);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoDataImportante>("prova");
  const [data, setData] = useState(paraISO(addDays(new Date(), 7)));
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (aberto) {
      setTitulo("");
      setErros({});
    }
  }, [aberto]);
  return (
    <Modal aberto={aberto} titulo={T.estudos.novaData} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!titulo.trim()) novos.titulo = T.validacao.obrigatorio;
          if (!dataValida(data)) novos.data = T.validacao.dataInvalida;
          setErros(novos);
          if (Object.keys(novos).length) return;
          criar({ materiaId: materia.id, titulo, tipo, data });
          void tocarSom("pop");
          aoFechar();
        }}
      >
        <Campo id="d-titulo" rotulo={T.estudos.tituloData} obrigatorio erro={erros.titulo}>
          <input id="d-titulo" className="campo" value={titulo} maxLength={120} aria-invalid={!!erros.titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="d-tipo" rotulo={T.calendario.tipo}>
            <select id="d-tipo" className="seletor" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDataImportante)}>
              {(Object.keys(T.estudos.tiposData) as TipoDataImportante[]).map((t) => <option key={t} value={t}>{T.estudos.tiposData[t]}</option>)}
            </select>
          </Campo>
          <Campo id="d-data" rotulo={T.financas.data} obrigatorio erro={erros.data}>
            <input id="d-data" type="date" className="campo" value={data} aria-invalid={!!erros.data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario" icone={<Plus size={14} />}>{T.estudos.novaData}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function Datas({ materia }: { materia: Materia }) {
  const datas = useEstudos((s) => s.datas).filter((d) => d.materiaId === materia.id).sort((a, b) => a.data.localeCompare(b.data));
  const atualizar = useEstudos((s) => s.atualizarData);
  const excluir = useEstudos((s) => s.excluirData);
  const [criando, setCriando] = useState(false);

  return (
    <div className="est-datas">
      <div className="est-barra-topo est-barra-direita">
        <Botao pequeno icone={<Plus size={12} />} onClick={() => setCriando(true)}>{T.estudos.novaData}</Botao>
      </div>
      {datas.length === 0 ? (
        <Vazio icone={<CalendarClock size={28} />} titulo={T.estudos.semDatas} />
      ) : (
        datas.map((d) => {
          const dias = diasAte(d.data);
          return (
            <div key={d.id} className="est-data" data-perto={!d.concluida && dias >= 0 && dias <= 7 ? "sim" : "nao"} data-feita={d.concluida ? "sim" : "nao"}>
              <span className="est-data-dia">
                <span className="est-data-numero">{formatar(d.data, "dd")}</span>
                <span className="est-data-mes">{formatar(d.data, "MMM")}</span>
              </span>
              <span className="est-data-texto">
                <span className="est-data-titulo">{d.titulo}</span>
                <span className="est-data-meta">
                  <span className="est-chip">{T.estudos.tiposData[d.tipo]}</span>
                  {!d.concluida && <span className="est-data-quando">{descreverDistancia(d.data)}</span>}
                  <span className="est-data-semana">{formatar(d.data, "EEEE")}</span>
                </span>
              </span>
              <span className="est-data-acoes">
                <Botao pequeno soIcone variante="fantasma" className="est-mostrar-no-hover" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} title={T.geral.excluir} onClick={() => excluir(d.id)} />
                <button
                  type="button"
                  className="marcador est-data-marcar"
                  role="checkbox"
                  aria-checked={d.concluida}
                  aria-label={d.titulo}
                  onClick={() => {
                    atualizar(d.id, { concluida: !d.concluida });
                    if (!d.concluida) void tocarSom("proud", "personagens");
                  }}
                >
                  <Check />
                </button>
              </span>
            </div>
          );
        })
      )}
      <NovaData materia={materia} aberto={criando} aoFechar={() => setCriando(false)} />
    </div>
  );
}

const TONS_DAS_NOTAS: Record<1 | 2 | 3 | 4, string> = { 1: "erro", 2: "alerta", 3: "neutro", 4: "sucesso" };

function SessaoRevisao({ materiaId }: { materiaId?: string }) {
  const cartoes = useEstudos((s) => s.cartoes);
  const avaliar = useEstudos((s) => s.avaliarCartao);
  const materias = useEstudos((s) => s.materias);
  const [mostrar, setMostrar] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const fila = cartoesVencidos(cartoes).filter((c) => !materiaId || c.materiaId === materiaId);
  const atual = fila[0];
  const total = feitos + fila.length;
  const intervalos = useMemo(() => (atual && mostrar ? previsaoIntervalos(atual) : null), [atual, mostrar]);

  const responder = (n: 1 | 2 | 3 | 4) => {
    if (!atual) return;
    avaliar(atual.id, n);
    setMostrar(false);
    setFeitos((f) => f + 1);
    void tocarSom(n === 1 ? "blip" : "pop");
  };

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable) return;
      if (!atual) return;
      if (e.code === "Space" && !mostrar) {
        e.preventDefault();
        setMostrar(true);
      }
      if (mostrar && ["1", "2", "3", "4"].includes(e.key)) {
        avaliar(atual.id, Number(e.key) as 1 | 2 | 3 | 4);
        setMostrar(false);
        setFeitos((f) => f + 1);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [atual, mostrar, avaliar]);

  if (!atual)
    return (
      <div className="est-sessao-vazia">
        <Vazio
          icone={<CheckCircle2 size={28} color="var(--sucesso)" />}
          titulo={feitos > 0 ? T.estudos.fimSessao : T.estudos.semRevisoes}
          texto={feitos > 0 ? T.estudos.revisados(feitos) : undefined}
        />
      </div>
    );

  return (
    <div className="est-sessao">
      <div className="est-sessao-topo">
        <span>{T.estudos.cartaoDe(feitos + 1, total)}{!materiaId && <span className="texto-3"> · {materias.find((m) => m.id === atual.materiaId)?.nome}</span>}</span>
        <span className="mono">{T.estudos.restantes(fila.length)}</span>
      </div>
      <div className="est-sessao-progresso"><span style={{ width: `${Math.round(((feitos + 1) / Math.max(1, total)) * 100)}%` }} /></div>
      <div className="est-sessao-cartao">
        <span className="est-sessao-rotulo">{T.estudos.frente}</span>
        <p className="est-sessao-frente">{atual.frente}</p>
        {mostrar && (
          <>
            <span className="est-sessao-divisor" />
            <span className="est-sessao-rotulo">{T.estudos.verso}</span>
            <p className="est-sessao-verso">{atual.verso}</p>
          </>
        )}
      </div>
      {!mostrar ? (
        <Botao variante="primario" className="est-sessao-mostrar" onClick={() => setMostrar(true)}>{T.estudos.mostrarResposta}<span className="tecla">Espaço</span></Botao>
      ) : (
        <div className="est-sessao-notas">
          {([1, 2, 3, 4] as const).map((n) => (
            <button key={n} type="button" className="est-nota" data-tom={TONS_DAS_NOTAS[n]} aria-keyshortcuts={String(n)} title={`${T.estudos.notas[n]} (${n})`} onClick={() => responder(n)}>
              {T.estudos.notas[n]}
              {intervalos && <span className="est-nota-intervalo">{descreverIntervalo(intervalos[n])}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NovoCartaoRevisao({ materia, aberto, aoFechar }: { materia: Materia; aberto: boolean; aoFechar: () => void }) {
  const criar = useEstudos((s) => s.criarCartao);
  const [frente, setFrente] = useState("");
  const [verso, setVerso] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (aberto) {
      setFrente("");
      setVerso("");
      setErros({});
    }
  }, [aberto]);
  return (
    <Modal aberto={aberto} titulo={T.estudos.novoCartaoRevisao} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!frente.trim()) novos.frente = T.validacao.obrigatorio;
          if (!verso.trim()) novos.verso = T.validacao.obrigatorio;
          setErros(novos);
          if (Object.keys(novos).length) return;
          criar(materia.id, frente, verso);
          setFrente("");
          setVerso("");
          document.getElementById("r-frente")?.focus();
        }}
      >
        <Campo id="r-frente" rotulo={T.estudos.frente} obrigatorio erro={erros.frente}>
          <input id="r-frente" className="campo" value={frente} maxLength={500} aria-invalid={!!erros.frente} autoFocus onChange={(e) => setFrente(e.target.value)} />
        </Campo>
        <Campo id="r-verso" rotulo={T.estudos.verso} obrigatorio erro={erros.verso}>
          <textarea id="r-verso" className="area-texto" value={verso} maxLength={2000} aria-invalid={!!erros.verso} onChange={(e) => setVerso(e.target.value)} />
        </Campo>
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.fechar}</Botao>
          <Botao type="submit" variante="primario" icone={<Plus size={14} />}>{T.estudos.novoCartaoRevisao}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function Revisoes({ materia }: { materia?: Materia }) {
  const cartoes = useEstudos((s) => s.cartoes).filter((c) => !materia || c.materiaId === materia.id);
  const paginasDeCartoes = usarPaginacao(cartoes, 12, materia?.id ?? "");
  const excluir = useEstudos((s) => s.excluirCartao);
  const revisoesConteudo = useEstudos((s) => s.revisoesConteudo);
  const paginas = useEstudos((s) => s.paginas);
  const concluirRevisao = useEstudos((s) => s.concluirRevisaoConteudo);
  const avisar = useInterface((s) => s.avisar);
  const [criando, setCriando] = useState(false);
  const hoje = hojeISO();
  const conteudo = revisoesConteudo.filter((r) => !r.feita && r.data <= hoje && (!materia || paginas.find((p) => p.id === r.paginaId)?.materiaId === materia.id));

  return (
    <div className="est-revisoes">
      <SessaoRevisao materiaId={materia?.id} />
      <aside className="est-revisoes-lado">
        {materia && (
          <div className="est-caixa">
            <span className="est-caixa-texto">{T.estudos.cartoesDaMateria(cartoes.length)}</span>
            <Botao pequeno icone={<Plus size={12} />} className="est-caixa-acao" onClick={() => setCriando(true)}>{T.estudos.novoCartaoRevisao}</Botao>
          </div>
        )}
        {conteudo.length > 0 && (
          <div className="est-caixa">
            <span className="est-rotulo">{T.estudos.revisoesConteudo}</span>
            {conteudo.map((r) => (
              <div key={r.id} className="est-caixa-linha">
                <span className="cortar">{paginas.find((p) => p.id === r.paginaId)?.titulo || T.estudos.semTitulo}</span>
                <Botao pequeno onClick={() => concluirRevisao(r.id)}>{T.estudos.revisaoFeita}</Botao>
                <Botao
                  pequeno
                  soIcone
                  variante="fantasma"
                  icone={<Trash2 size={12} />}
                  aria-label={T.estudos.removerRevisao}
                  title={T.estudos.removerRevisao}
                  onClick={() => {
                    const removida = useEstudos.getState().excluirRevisaoConteudo(r.id);
                    if (removida) avisar(T.geral.excluido, () => useEstudos.getState().restaurarRevisaoConteudo(removida));
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {cartoes.length > 0 && (
          <div className="est-caixa">
            <span className="est-rotulo">{T.estudos.cartoes}</span>
            <div className="est-cartoes-lista">
              {paginasDeCartoes.visiveis.map((c) => (
                <div key={c.id} className="est-cartao-revisao">
                  <span className="est-cartao-revisao-texto">
                    <span className="cortar">{c.frente}</span>
                    <span className="cortar texto-3">{c.verso}</span>
                  </span>
                  <span className="est-chip">{new Date(c.vencimento) <= new Date() ? T.datas.hoje : descreverDistancia(paraISO(new Date(c.vencimento)))}</span>
                  <Botao pequeno soIcone variante="fantasma" className="est-mostrar-no-hover" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} title={T.geral.excluir} onClick={() => excluir(c.id)} />
                </div>
              ))}
            </div>
            <Paginacao {...paginasDeCartoes} />
          </div>
        )}
      </aside>
      {materia && <NovoCartaoRevisao materia={materia} aberto={criando} aoFechar={() => setCriando(false)} />}
    </div>
  );
}

function Links({ materia }: { materia?: Materia }) {
  const links = useEstudos((s) => s.links).filter((l) => !materia || l.materiaId === materia.id);
  const salvar = useEstudos((s) => s.salvarLink);
  const atualizar = useEstudos((s) => s.atualizarLink);
  const excluir = useEstudos((s) => s.excluirLink);
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [tags, setTags] = useState("");
  const [filtro, setFiltro] = useState<EstadoLink | "todos">("todos");
  const [erro, setErro] = useState("");

  const lista = links.filter((l) => filtro === "todos" || l.estado === filtro);
  const paginas = usarPaginacao(lista, 20, `${filtro}|${materia?.id ?? ""}`);

  return (
    <div className="est-links">
      <form
        className="est-links-formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const u = urlSegura(url);
          if (!u) return setErro(T.validacao.urlInvalida);
          salvar({
            url: u.href,
            titulo: titulo.trim().slice(0, 120) || u.hostname.replace(/^www\./, ""),
            nota: "",
            tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
            materiaId: materia?.id,
            estado: "para_ler",
          });
          setUrl("");
          setTitulo("");
          setTags("");
          setErro("");
          void tocarSom("gulp");
        }}
      >
        <label className="est-campo-icone est-links-url">
          <Link2 size={13} />
          <input id="l-url" className="campo" value={url} type="url" inputMode="url" placeholder={T.estudos.url} aria-label={T.estudos.url} aria-invalid={!!erro} aria-describedby={erro ? "l-url-erro" : undefined} onChange={(e) => { setUrl(e.target.value); setErro(""); }} />
        </label>
        <input className="campo est-links-titulo" value={titulo} maxLength={120} placeholder={T.estudos.tituloLink} aria-label={T.estudos.tituloLink} onChange={(e) => setTitulo(e.target.value)} />
        <input className="campo est-links-tags" value={tags} maxLength={120} placeholder={T.estudos.tags} aria-label={T.estudos.tags} title={T.estudos.tagsDica} onChange={(e) => setTags(e.target.value)} />
        <Botao type="submit" variante="primario" className="est-links-salvar">{T.estudos.novoLink}</Botao>
      </form>
      {erro && <span id="l-url-erro" className="campo-erro">{erro}</span>}
      <div className="est-links-filtros">
        <Pilulas<EstadoLink | "todos">
          rotulo={T.estudos.abas.links}
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[{ valor: "todos", rotulo: T.geral.todos }, ...(Object.keys(T.estudos.estadosLink) as EstadoLink[]).map((e) => ({ valor: e, rotulo: T.estudos.estadosLink[e] }))]}
        />
        <span className="est-dica">{T.estudos.aviso_meta}</span>
      </div>
      {lista.length === 0 ? (
        <Vazio icone={<Link2 size={28} />} titulo={T.estudos.semLinks} />
      ) : (
        paginas.visiveis.map((l) => (
          <div key={l.id} className="est-link">
            <span className="est-link-icone"><Globe size={15} /></span>
            <span className="est-link-texto">
              <a className="est-link-titulo" href={l.url} target="_blank" rel="noopener noreferrer">{l.titulo}</a>
              <span className="est-link-url">{l.url}</span>
              {l.tags.length > 0 && <span className="est-link-tags">{l.tags.map((t) => <span key={t} className="est-chip">{t}</span>)}</span>}
            </span>
            <select className="est-link-estado" data-estado={l.estado} value={l.estado} aria-label={T.estudos.estadoLink} onChange={(e) => atualizar(l.id, { estado: e.target.value as EstadoLink })}>
              {(Object.keys(T.estudos.estadosLink) as EstadoLink[]).map((e) => <option key={e} value={e}>{T.estudos.estadosLink[e]}</option>)}
            </select>
            <a className="est-link-abrir" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={T.estudos.abrirLink} title={T.estudos.abrirLink}><ArrowUpRight size={13} /></a>
            <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} title={T.geral.excluir} onClick={() => excluir(l.id)} />
          </div>
        ))
      )}
      <Paginacao {...paginas} />
    </div>
  );
}

function Estatisticas() {
  const materias = useEstudos((s) => s.materias);
  const areas = useEstudos((s) => s.areas);
  const datas = useEstudos((s) => s.datas);
  const registro = useEstudos((s) => s.registroRevisoes);
  const sessoes = usePomodoro((s) => s.sessoes);
  const porMateria = new Map<string, number>();
  for (const s of sessoes) if (s.etapa === "foco" && s.situacao === "concluida" && s.materiaId) porMateria.set(s.materiaId, (porMateria.get(s.materiaId) ?? 0) + s.minutos);
  const horas = [...porMateria].map(([id, v]) => {
    const m = materias.find((x) => x.id === id);
    return { id, nome: m?.nome ?? "", cor: areas.find((a) => a.id === m?.areaId)?.cor ?? "var(--destaque)", valor: v };
  }).sort((a, b) => b.valor - a.valor);
  const maiorHora = Math.max(1, ...horas.map((h) => h.valor));
  const ultimos = Array.from({ length: 14 }, (_, i) => paraISO(addDays(new Date(), i - 13)));
  const revisadosPorDia = ultimos.map((d) => ({ dia: d, valor: registro.find((r) => r.data === d)?.quantidade ?? 0 }));
  const maiorDia = Math.max(1, ...revisadosPorDia.map((d) => d.valor));
  const minutos = minutosEstudoPorDia(sessoes);
  const sequencia = sequenciaDias(new Set([...minutos.keys(), ...registro.filter((r) => r.quantidade > 0).map((r) => r.data)]));
  const hoje = hojeISO();
  const provas = datas.filter((d) => d.tipo === "prova" && !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="est-estatisticas">
      <div className="est-caixa">
        <span className="est-caixa-titulo">{T.estudos.horasPorMateria}</span>
        {horas.length === 0 ? <p className="est-dica">{T.estudos.semHoras}</p> : horas.map((h) => (
          <div key={h.id} className="est-barra-linha">
            <span className="cortar">{h.nome}</span>
            <span className="est-barra-trilho"><span style={{ width: `${(h.valor / maiorHora) * 100}%`, background: h.cor }} /></span>
            <span className="est-barra-valor">{T.estudos.duracao(h.valor)}</span>
          </div>
        ))}
      </div>
      <div className="est-caixa">
        <span className="est-caixa-cabecalho">
          <span className="est-caixa-titulo">{T.estudos.revisadosPorDia}</span>
          <span className="est-sequencia">{T.estudos.sequenciaEstudo(sequencia)}</span>
        </span>
        <div className="est-colunas-grafico" role="img" aria-label={T.estudos.revisadosPorDia}>
          {revisadosPorDia.map((d, i) => (
            <span key={d.dia} className="est-coluna-grafico" data-hoje={i === revisadosPorDia.length - 1 ? "sim" : "nao"} title={T.estudos.diaRevisados(formatar(d.dia, "d/MM"), d.valor)} style={{ height: `${Math.max(3, (d.valor / maiorDia) * 100)}%` }} />
          ))}
        </div>
      </div>
      <div className="est-caixa">
        <span className="est-caixa-titulo">{T.estudos.proximasProvas}</span>
        {provas.length === 0 ? <p className="est-dica">{T.estudos.semDatas}</p> : provas.map((p) => (
          <div key={p.id} className="est-linha-lista">
            <span className="cortar">{p.titulo}</span>
            <span className="est-quando" data-perto={diasAte(p.data) <= 7 ? "sim" : "nao"}>{descreverDistancia(p.data)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarraAreas({ areaAtiva, busca, aoBuscar, aoArea, aoVisaoGeral, aoNovaMateria, aoExcluirArea }: { areaAtiva?: string; busca: string; aoBuscar: (v: string) => void; aoArea: (id: string) => void; aoVisaoGeral: () => void; aoNovaMateria: (areaId: string) => void; aoExcluirArea: (id: string) => void }) {
  const areas = useEstudos((s) => s.areas);
  const materias = useEstudos((s) => s.materias);
  const cartoes = useEstudos((s) => s.cartoes);
  const barra = useRef<HTMLElement>(null);
  const totalHoje = cartoesVencidos(cartoes).length;

  useEffect(() => {
    const fecharMenus = (e: PointerEvent) => {
      barra.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => {
        if (e.target instanceof Node && !menu.contains(e.target)) menu.open = false;
      });
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const menu = barra.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (!menu) return;
      e.stopPropagation();
      menu.open = false;
      menu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", fecharMenus);
    document.addEventListener("keydown", aoTeclar, true);
    return () => {
      document.removeEventListener("pointerdown", fecharMenus);
      document.removeEventListener("keydown", aoTeclar, true);
    };
  }, []);

  const fecharMenus = () => barra.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => { menu.open = false; });

  return (
    <section ref={barra} className="est-areas">
      <span className="est-rotulo">{T.estudos.areas}</span>
      <div className="est-areas-trilho" role="tablist" aria-label={T.estudos.areas}>
        <button type="button" role="tab" className="est-area" data-geral="sim" aria-selected={!areaAtiva} onClick={() => { fecharMenus(); aoVisaoGeral(); }}>
          {T.estudos.visaoGeral}
          {totalHoje > 0 && <span className="est-area-n est-area-n-alerta" title={T.estudos.revisarAgora(totalHoje)}>{totalHoje}</span>}
        </button>
        {areas.map((a) => {
          const n = materias.filter((m) => m.areaId === a.id).length;
          return (
            <button key={a.id} type="button" role="tab" className="est-area" aria-selected={a.id === areaAtiva} title={a.nome} onClick={() => { fecharMenus(); aoArea(a.id); }}>
              <span className="cortar">{a.nome}</span>
              {n > 0 && <span className="est-area-n">{n}</span>}
            </button>
          );
        })}
      </div>
      {areaAtiva && (
        <details className="est-menu" key={areaAtiva}>
          <summary className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.estudos.acoesArea} title={T.estudos.acoesArea}><Ellipsis size={16} /></summary>
          <div className="est-menu-painel">
            <button type="button" onClick={() => { fecharMenus(); aoNovaMateria(areaAtiva); }}><Plus size={14} />{T.estudos.novaMateria}</button>
            <button type="button" className="est-menu-perigo" onClick={() => { fecharMenus(); aoExcluirArea(areaAtiva); }}><Trash2 size={14} />{T.estudos.excluirAreaRotulo}</button>
          </div>
        </details>
      )}
      <span className="est-espaco" />
      {areaAtiva && (
        <label className="est-campo-icone est-areas-busca">
          <Search size={13} />
          <input className="campo" value={busca} placeholder={T.estudos.buscarMateria} aria-label={T.estudos.buscarMateria} onChange={(e) => aoBuscar(e.target.value)} />
        </label>
      )}
    </section>
  );
}

function GradeMaterias({ areaId, materiaId, busca, aoEscolher, aoNovaMateria }: { areaId: string; materiaId?: string; busca: string; aoEscolher: (id: string) => void; aoNovaMateria: () => void }) {
  const area = useEstudos((s) => s.areas.find((a) => a.id === areaId));
  const materias = useEstudos((s) => s.materias);
  const cartoes = useEstudos((s) => s.cartoes);
  const datas = useEstudos((s) => s.datas);
  const lista = materias.filter((m) => m.areaId === areaId);
  const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim();
  const termo = normalizar(busca);
  const resultados = termo ? lista.filter((m) => normalizar(m.nome).includes(termo)) : lista;
  const vencidos = cartoesVencidos(cartoes);

  if (lista.length === 0)
    return (
      <section className="est-materias">
        <button type="button" className="est-tracejado est-materia-nova" onClick={aoNovaMateria}>
          <Plus size={13} />
          {T.estudos.novaMateria}
        </button>
        <span className="est-dica est-materias-vazio">{T.estudos.semMateriasNaArea}</span>
      </section>
    );

  if (resultados.length === 0) return <p className="est-dica">{T.estudos.semResultadoBusca}</p>;

  return (
    <section className="est-materias" style={{ ["--cor-area" as string]: area?.cor ?? "var(--destaque)" }}>
      {resultados.map((m) => {
        const pendentes = vencidos.filter((c) => c.materiaId === m.id).length;
        const prova = proximaData(datas, m.id);
        return (
          <button key={m.id} type="button" className="est-materia" aria-current={m.id === materiaId} title={m.nome} onClick={() => aoEscolher(m.id)}>
            <span className="est-materia-faixa" />
            <span className="est-materia-topo">
              <span className="est-materia-codigo">{m.semestre ?? ""}</span>
              <span className="est-materia-rev" title={T.estudos.revisarAgora(pendentes)}>{pendentes}</span>
            </span>
            <span className="est-materia-nome">{m.nome}</span>
            <span className="est-materia-prova cortar" data-perto={prova && diasAte(prova.data) <= 7 ? "sim" : "nao"}>
              {prova ? `${prova.titulo} ${descreverDistancia(prova.data)}` : T.estudos.semProvas}
            </span>
          </button>
        );
      })}
    </section>
  );
}

function BotaoEstudar({ materia }: { materia: Materia }) {
  const rodando = usePomodoro((s) => s.rodando);
  const vinculo = usePomodoro((s) => s.materiaId);
  const estudandoAqui = rodando && vinculo === materia.id;

  const estudar = () => {
    const p = usePomodoro.getState();
    if (estudandoAqui) return p.alternar();
    p.escolherEtapa("foco");
    p.definirVinculo(materia.id);
    p.iniciar();
    void tocarSom("work", "pomodoro");
    void useAgentes.getState().trabalhar("tutor", T.estudos.estudando(materia.nome), 600);
  };

  return (
    <Botao variante={estudandoAqui ? "secundario" : "primario"} icone={estudandoAqui ? <Pause size={13} /> : <Play size={13} />} onClick={estudar}>
      {estudandoAqui ? T.pomodoro.pausar : T.estudos.estudarAgora}
    </Botao>
  );
}

function AbasEstudo({ abas, aba, aoAba, pendentes, rotulo }: { abas: Aba[]; aba: Aba; aoAba: (a: Aba) => void; pendentes: number; rotulo: string }) {
  return (
    <div className="est-abas" role="tablist" aria-label={rotulo}>
      {abas.map((a) => (
        <button key={a} type="button" role="tab" aria-selected={aba === a} className="est-aba" onClick={() => aoAba(a)}>
          {ICONES_ABA[a]}
          {T.estudos.abas[a]}
          {a === "revisoes" && pendentes > 0 && <span className="est-aba-n">{pendentes}</span>}
        </button>
      ))}
    </div>
  );
}

function PainelMateria({ materia, aba, aoAba, aoExcluir, children }: { materia: Materia; aba: Aba; aoAba: (a: Aba) => void; aoExcluir: () => void; children: React.ReactNode }) {
  const area = useEstudos((s) => s.areas.find((a) => a.id === materia.areaId));
  const paginas = useEstudos((s) => s.paginas).filter((p) => p.materiaId === materia.id).length;
  const cartoes = useEstudos((s) => s.cartoes).filter((c) => c.materiaId === materia.id);
  const datas = useEstudos((s) => s.datas);
  const tarefas = useRotina((s) => s.tarefas).filter((t) => t.materiaId === materia.id && t.status !== "concluida" && t.status !== "cancelada").length;
  const sessoes = usePomodoro((s) => s.sessoes);
  const minutos = minutosDeFoco(sessoes, materia.id);
  const pendentes = cartoesVencidos(cartoes).length;
  const prova = proximaData(datas, materia.id);
  const cor = area?.cor ?? "var(--destaque)";

  return (
    <section className="est-painel" style={{ ["--cor-area" as string]: cor }}>
      <div className="est-painel-topo">
        <div className="est-painel-titulo">
          <span className="est-painel-rotulo">{area?.nome}{materia.semestre ? ` · ${materia.semestre}` : ""}</span>
          <h2 className="est-painel-nome">{materia.nome}</h2>
        </div>
        <span className="est-espaco" />
        <div className="est-painel-numeros">
          <button type="button" className="est-numero-pequeno est-numero-botao" onClick={() => aoAba("revisoes")}>
            <span className="est-numero-valor">{pendentes}</span>
            <span className="est-numero-rotulo">{T.estudos.revisoesHoje}</span>
          </button>
          <span className="est-numero-pequeno">
            <span className="est-numero-valor">{paginas}</span>
            <span className="est-numero-rotulo">{T.estudos.numeros.paginas}</span>
          </span>
          <span className="est-numero-pequeno">
            <span className="est-numero-valor">{tarefas}</span>
            <span className="est-numero-rotulo">{T.estudos.numeros.tarefas}</span>
          </span>
          <span className="est-numero-pequeno">
            <span className="est-numero-valor">{T.estudos.duracao(minutos)}</span>
            <span className="est-numero-rotulo">{T.estudos.numeros.horas}</span>
          </span>
          {prova && (
            <span className="est-numero-pequeno" data-perto={diasAte(prova.data) <= 7 ? "sim" : "nao"}>
              <span className="est-numero-valor">{descreverDistancia(prova.data)}</span>
              <span className="est-numero-rotulo cortar">{prova.titulo}</span>
            </span>
          )}
          <Botao soIcone variante="fantasma" icone={<Trash2 size={14} />} aria-label={T.estudos.excluirMateriaRotulo} title={T.estudos.excluirMateriaRotulo} onClick={aoExcluir} />
        </div>
      </div>
      <AbasEstudo abas={ABAS_MATERIA} aba={aba} aoAba={aoAba} pendentes={pendentes} rotulo={materia.nome} />
      <div className="est-painel-corpo" data-aba={aba}>{children}</div>
    </section>
  );
}

function VisaoGeral({ aba, aoAba, aoAbrirMateria, children }: { aba: Aba; aoAba: (a: Aba) => void; aoAbrirMateria: (id: string) => void; children: React.ReactNode }) {
  const areas = useEstudos((s) => s.areas);
  const materias = useEstudos((s) => s.materias);
  const paginas = useEstudos((s) => s.paginas);
  const cartoes = useEstudos((s) => s.cartoes);
  const revisoesConteudo = useEstudos((s) => s.revisoesConteudo);
  const datas = useEstudos((s) => s.datas);
  const tarefas = useRotina((s) => s.tarefas);
  const sessoes = usePomodoro((s) => s.sessoes);
  const vencidos = cartoesVencidos(cartoes);
  const abertas = tarefas.filter((t) => t.materiaId && t.status !== "concluida" && t.status !== "cancelada").length;
  const paraHoje = revisoesParaHoje({ cartoes, revisoesConteudo });
  const hoje = hojeISO();
  const proximas = datas.filter((d) => !d.concluida && d.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 6);

  return (
    <>
      <section className="bento est-numeros">
        <div className="est-numero"><span className="est-numero-grande">{paginas.length}</span><span className="est-numero-legenda">{T.estudos.numeros.paginas}</span></div>
        <div className="est-numero"><span className="est-numero-grande">{abertas}</span><span className="est-numero-legenda">{T.estudos.numeros.tarefas}</span></div>
        <div className="est-numero"><span className="est-numero-grande est-numero-destaque">{paraHoje}</span><span className="est-numero-legenda">{T.estudos.numeros.cartoes}</span></div>
        <div className="est-numero"><span className="est-numero-grande">{T.estudos.duracao(minutosDeFoco(sessoes))}</span><span className="est-numero-legenda">{T.estudos.numeros.horas}</span></div>
      </section>
      <section className="est-resumo-areas">
        {areas.map((a) => {
          const daArea = materias.filter((m) => m.areaId === a.id);
          return (
            <div key={a.id} className="est-resumo-area" style={{ ["--cor-area" as string]: a.cor }}>
              <span className="est-resumo-area-topo">
                <b className="cortar">{a.nome}</b>
                <span className="est-chip">{T.estudos.tipos[a.tipo]}</span>
              </span>
              <div className="est-resumo-area-lista">
                {daArea.length === 0 && <span className="est-dica">{T.estudos.semMateriasNaArea}</span>}
                {daArea.map((m) => (
                  <button key={m.id} type="button" className="est-resumo-materia" onClick={() => aoAbrirMateria(m.id)}>
                    <span className="est-resumo-ponto" />
                    <span className="cortar">{m.nome}</span>
                    <span className="est-resumo-rev">{T.estudos.revisoesCurto(vencidos.filter((c) => c.materiaId === m.id).length)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <section className="est-proximas">
        <span className="est-caixa-titulo">{T.estudos.proximasDatas}</span>
        {proximas.length === 0 && <span className="est-dica">{T.estudos.semDatas}</span>}
        {proximas.map((d) => (
          <button key={d.id} type="button" className="est-linha-lista est-linha-botao" onClick={() => aoAbrirMateria(d.materiaId)}>
            <span className="cortar">{d.titulo}<span className="texto-3"> · {materias.find((m) => m.id === d.materiaId)?.nome}</span></span>
            <span className="est-quando" data-perto={diasAte(d.data) <= 7 ? "sim" : "nao"}>{descreverDistancia(d.data)}</span>
          </button>
        ))}
      </section>
      <section className="est-painel">
        <AbasEstudo abas={ABAS_GERAIS} aba={aba} aoAba={aoAba} pendentes={vencidos.length} rotulo={T.estudos.visaoGeral} />
        <div className="est-painel-corpo" data-aba={aba}>{children}</div>
      </section>
    </>
  );
}

export default function Estudos() {
  const parametros = useInterface((s) => s.parametros);
  const areas = useEstudos((s) => s.areas);
  const materias = useEstudos((s) => s.materias);
  const excluirMateria = useEstudos((s) => s.excluirMateria);
  const excluirArea = useEstudos((s) => s.excluirArea);
  const [materiaId, setMateriaId] = useState<string | undefined>(parametros.materia || undefined);
  const [areaEscolhida, setAreaEscolhida] = useState<string | undefined>(undefined);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>((parametros.aba as Aba) || (parametros.materia ? "anotacoes" : "estatisticas"));
  const [criandoArea, setCriandoArea] = useState(false);
  const [criandoMateria, setCriandoMateria] = useState<string | undefined | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: "area" | "materia"; id: string } | null>(null);
  const materia = materias.find((m) => m.id === materiaId);
  const areaAtiva = areas.find((a) => a.id === (materia?.areaId ?? areaEscolhida))?.id;

  useEffect(() => {
    if (parametros.materia !== undefined) setMateriaId(parametros.materia || undefined);
    if (parametros.aba) setAba(parametros.aba as Aba);
  }, [parametros]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "estudos") setCriandoMateria(undefined);
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const escolher = (id?: string) => {
    setMateriaId(id);
    setAba((a) => (id ? (ABAS_QUE_SEGUEM_A_MATERIA.includes(a) ? a : "anotacoes") : ABAS_GERAIS.includes(a) ? a : "estatisticas"));
  };

  const abrirMateria = (id: string) => {
    setAreaEscolhida(materias.find((m) => m.id === id)?.areaId);
    escolher(id);
  };

  const irParaArea = (id: string) => {
    setBusca("");
    setAreaEscolhida(id);
    if (materia?.areaId !== id) escolher(materias.find((m) => m.areaId === id)?.id);
  };

  const irParaVisaoGeral = () => {
    setBusca("");
    setAreaEscolhida(undefined);
    escolher(undefined);
  };

  const abaValida = materia ? (ABAS_MATERIA.includes(aba) ? aba : "anotacoes") : ABAS_GERAIS.includes(aba) ? aba : "estatisticas";

  const conteudo = useMemo(() => {
    switch (abaValida) {
      case "anotacoes":
        return materia && <Anotacoes materia={materia} paginaInicial={parametros.pagina} />;
      case "quadro":
        return materia && <Quadro materia={materia} />;
      case "datas":
        return materia && <Datas materia={materia} />;
      case "revisoes":
        return <Revisoes materia={materia} key={materia?.id ?? "todas"} />;
      case "arquivos":
        return materia && <Arquivos materia={materia} />;
      case "links":
        return <Links materia={materia} />;
      case "estatisticas":
        return <Estatisticas />;
    }
  }, [abaValida, materia, parametros.pagina]);

  return (
    <>
      <CabecalhoAba
        titulo={T.estudos.titulo}
        subtitulo={T.estudos.subtitulo}
        acoes={
          <>
            <Botao icone={<FolderPlus size={13} />} onClick={() => setCriandoArea(true)}>{T.estudos.novaArea}</Botao>
            <Botao icone={<Plus size={13} />} onClick={() => setCriandoMateria(areaAtiva)}>{T.estudos.novaMateria}</Botao>
            {materia && <BotaoEstudar materia={materia} />}
          </>
        }
      />
      {areas.length === 0 ? (
        <section className="est-painel">
          <Vazio icone={<GraduationCap size={28} />} titulo={T.estudos.semMaterias} texto={T.estudos.semMateriasDica} acao={<Botao variante="primario" onClick={() => setCriandoArea(true)}>{T.estudos.novaArea}</Botao>} />
        </section>
      ) : (
        <>
          <BarraAreas
            areaAtiva={areaAtiva}
            busca={busca}
            aoBuscar={setBusca}
            aoArea={irParaArea}
            aoVisaoGeral={irParaVisaoGeral}
            aoNovaMateria={(id) => setCriandoMateria(id)}
            aoExcluirArea={(id) => setConfirmar({ tipo: "area", id })}
          />
          {areaAtiva ? (
            <>
              <GradeMaterias areaId={areaAtiva} materiaId={materiaId} busca={busca} aoEscolher={(id) => escolher(id)} aoNovaMateria={() => setCriandoMateria(areaAtiva)} />
              {materia && (
                <PainelMateria materia={materia} aba={abaValida} aoAba={setAba} aoExcluir={() => setConfirmar({ tipo: "materia", id: materia.id })}>
                  {conteudo}
                </PainelMateria>
              )}
            </>
          ) : (
            <VisaoGeral aba={abaValida} aoAba={setAba} aoAbrirMateria={abrirMateria}>
              {conteudo}
            </VisaoGeral>
          )}
        </>
      )}
      <NovaArea aberto={criandoArea} aoFechar={() => setCriandoArea(false)} />
      <NovaMateria aberto={criandoMateria !== null} areaId={criandoMateria ?? undefined} aoFechar={() => setCriandoMateria(null)} aoCriar={(m) => abrirMateria(m.id)} />
      <ConfirmarModal
        aberto={!!confirmar}
        titulo={T.geral.confirmarExclusao}
        texto={confirmar?.tipo === "area" ? T.estudos.excluirArea : T.estudos.excluirMateria}
        aoFechar={() => setConfirmar(null)}
        aoConfirmar={() => {
          if (!confirmar) return;
          const materiasApagadas = confirmar.tipo === "area" ? materias.filter((m) => m.areaId === confirmar.id).map((m) => m.id) : [confirmar.id];
          if (confirmar.tipo === "area") excluirArea(confirmar.id);
          else excluirMateria(confirmar.id);
          for (const id of materiasApagadas) void excluirArquivosDaMateria(id).catch(() => undefined);
          if (confirmar.tipo === "area" && areaAtiva === confirmar.id) irParaVisaoGeral();
          else if (confirmar.id === materiaId) escolher(undefined);
        }}
      />
    </>
  );
}

import { useEffect, useState, type CSSProperties } from "react";
import { Plus, Trash2, Target, ImagePlus, Pencil, Image as IconeImagem, Check, Link2, TrendingUp, Columns3 } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Botao, Campo, Modal, Vazio, ConfirmarModal } from "../../componentes/basicos";
import { useOrganizacao } from "../../estado/organizacao";
import { useRotina } from "../../estado/rotina";
import { usePomodoro } from "../../estado/pomodoro";
import { useFinancas } from "../../estado/financas";
import { useEstudos } from "../../estado/estudos";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { dataValida, diasAte, formatar } from "../../utilitarios/datas";
import { lerImagemComoDataUrl } from "../../utilitarios/basicos";
import { tocarSom } from "../../ponte/sons";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import { QuadroDeTarefas } from "../../componentes/QuadroDeTarefas";
import { CaixaDeEscolha } from "../../componentes/CaixaDeEscolha";
import { progressoDaMeta } from "../../utilitarios/progressoDaMeta";
import type { CartaoVisao, Evento, Meta, TipoMeta } from "../../tipos";

const COR_PILAR = ["var(--sucesso)", "var(--roxo)", "var(--alerta)", "var(--info)", "var(--destaque-claro)"];

function useProgresso() {
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const sessoes = usePomodoro((s) => s.sessoes);
  const economias = useFinancas((s) => s.metasEconomia);
  const eventos = useOrganizacao((s) => s.eventos);
  return (m: Meta) => progressoDaMeta(m, { eventos, tarefas, habitos, registros, sessoes, economias });
}

// Tarefas e eventos guardam o vínculo com a meta; sem isso, ficariam presos a uma meta que não conta mais por eles.
function desligarDaMeta(metaId: string) {
  const rotina = useRotina.getState();
  rotina.tarefas.filter((t) => t.metaId === metaId).forEach((t) => rotina.atualizarTarefa(t.id, { metaId: undefined }));
  const org = useOrganizacao.getState();
  org.eventos.filter((e) => e.metaId === metaId).forEach((e) => org.atualizarEvento(e.id, { metaId: undefined }));
}

function FormMeta({ aberto, meta, aoFechar }: { aberto: boolean; meta?: Meta | null; aoFechar: () => void }) {
  const org = useOrganizacao();
  const habitos = useRotina((s) => s.habitos).filter((h) => !h.arquivado || h.id === meta?.vinculoId);
  const materias = useEstudos((s) => s.materias);
  const economias = useFinancas((s) => s.metasEconomia);
  const [nome, setNome] = useState("");
  const [pilarId, setPilarId] = useState("");
  const [tipo, setTipo] = useState<TipoMeta>("manual");
  const [alvo, setAlvo] = useState("10");
  const [vinculo, setVinculo] = useState("");
  const [periodo, setPeriodo] = useState<"trimestre" | "ano">("trimestre");
  const [prazo, setPrazo] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setNome(meta?.nome ?? "");
    setPilarId(meta?.pilarId ?? org.pilares[0]?.id ?? "");
    setTipo(meta?.tipo ?? "manual");
    setAlvo(String(meta?.alvo ?? 10));
    setVinculo(meta?.vinculoId ?? "");
    setPeriodo(meta?.periodo ?? "trimestre");
    setPrazo(meta?.prazo ?? "");
    setErros({});
  }, [aberto, meta]);

  const opcoesVinculo = tipo === "habito" ? habitos.map((h) => ({ id: h.id, nome: h.nome })) : tipo === "estudo" ? materias.map((m) => ({ id: m.id, nome: m.nome })) : tipo === "financeira" ? economias.map((e) => ({ id: e.id, nome: e.nome })) : [];

  return (
    <Modal aberto={aberto} titulo={meta ? T.metas.editarMeta : T.metas.novaMeta} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
          if (!pilarId) novos.pilar = T.validacao.obrigatorio;
          const a = Number(alvo);
          if (["manual", "estudo", "habito"].includes(tipo) && (!Number.isFinite(a) || a <= 0 || a > 100000)) novos.alvo = T.validacao.entre(1, 100000);
          if (opcoesVinculo.length > 0 && !vinculo) novos.vinculo = T.validacao.obrigatorio;
          if (["habito", "estudo", "financeira"].includes(tipo) && opcoesVinculo.length === 0) novos.vinculo = T.metas.semVinculo;
          if (prazo && !dataValida(prazo)) novos.prazo = T.validacao.dataInvalida;
          setErros(novos);
          if (Object.keys(novos).length) return;
          const dados = { nome, pilarId, tipo, alvo: tipo === "habito" ? Math.min(100, a) : a || 100, vinculoId: vinculo || undefined, periodo, prazo: prazo || undefined };
          if (meta) {
            if (meta.tipo === "tarefas" && tipo !== "tarefas") desligarDaMeta(meta.id);
            org.atualizarMeta(meta.id, dados);
          } else {
            org.criarMeta({ ...dados, atual: 0 });
          }
          aoFechar();
        }}
      >
        <Campo id="mt-nome" rotulo={T.metas.nome} obrigatorio erro={erros.nome}>
          <input id="mt-nome" className="campo" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="mt-pilar" rotulo={T.metas.pilar} obrigatorio erro={erros.pilar}>
            <select id="mt-pilar" className="seletor" value={pilarId} onChange={(e) => setPilarId(e.target.value)}>
              {org.pilares.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo id="mt-periodo" rotulo={T.metas.periodo}>
            <select id="mt-periodo" className="seletor" value={periodo} onChange={(e) => setPeriodo(e.target.value as "trimestre" | "ano")}>
              <option value="trimestre">{T.metas.trimestre}</option>
              <option value="ano">{T.metas.ano}</option>
            </select>
          </Campo>
        </div>
        <div className="formulario-linha">
          <Campo id="mt-tipo" rotulo={T.metas.tipo}>
            <select id="mt-tipo" className="seletor" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoMeta); setVinculo(""); }}>
              {(Object.keys(T.metas.tipos) as TipoMeta[]).map((t) => <option key={t} value={t}>{T.metas.tipos[t]}</option>)}
            </select>
          </Campo>
          {["manual", "estudo", "habito"].includes(tipo) && (
            <Campo id="mt-alvo" rotulo={tipo === "estudo" ? T.metas.alvoHoras : tipo === "habito" ? T.metas.alvoPct : T.metas.alvo} obrigatorio erro={erros.alvo}>
              <input id="mt-alvo" className="campo" inputMode="numeric" value={alvo} onChange={(e) => setAlvo(e.target.value.replace(/[^\d]/g, ""))} />
            </Campo>
          )}
        </div>
        {opcoesVinculo.length > 0 || erros.vinculo ? (
          <Campo id="mt-vinc" rotulo={T.metas.vinculo} obrigatorio erro={erros.vinculo}>
            <CaixaDeEscolha
              id="mt-vinc"
              opcoes={opcoesVinculo.map((o) => ({ valor: o.id, rotulo: o.nome }))}
              valor={vinculo}
              aoMudar={setVinculo}
              placeholder={T.financas.escolha}
              textoDaBusca={T.geral.buscarOpcao}
              textoSemResultado={T.geral.nadaEncontrado}
              invalida={Boolean(erros.vinculo)}
            />
          </Campo>
        ) : null}
        {tipo === "tarefas" && <p className="campo-dica">{T.metas.metaDeTarefas}</p>}
        <Campo id="mt-prazo" rotulo={T.financas.prazo} erro={erros.prazo} dica={T.metas.prazoDica}>
          <input id="mt-prazo" type="date" className="campo" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Campo>
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{meta ? T.geral.salvar : T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function LigarTarefas({ meta, aoFechar }: { meta: Meta | null; aoFechar: () => void }) {
  const tarefas = useRotina((s) => s.tarefas);
  const atualizar = useRotina((s) => s.atualizarTarefa);
  const eventos = useOrganizacao((s) => s.eventos);
  const metas = useOrganizacao((s) => s.metas);
  const atualizarEvento = useOrganizacao((s) => s.atualizarEvento);
  const [busca, setBusca] = useState("");
  useEffect(() => {
    if (meta) setBusca("");
  }, [meta]);
  if (!meta) return null;
  // Um item restaurado depois de a meta dele ser excluída aponta para uma meta que não existe: conta como livre.
  const livre = (metaId?: string) => !metaId || !metas.some((m) => m.id === metaId);
  const termo = busca.trim().toLowerCase();
  const visiveis = tarefas
    .filter((t) => t.metaId === meta.id || livre(t.metaId))
    .filter((t) => !termo || t.titulo.toLowerCase().includes(termo))
    .sort((a, b) => Number(b.metaId === meta.id) - Number(a.metaId === meta.id) || Number(a.status === "concluida") - Number(b.status === "concluida") || a.titulo.localeCompare(b.titulo));
  const ligadas = tarefas.filter((t) => t.metaId === meta.id).length;
  // Eventos com o mesmo título (ex.: "Academia" de segunda a sábado) entram juntos com um clique.
  const grupos = new Map<string, Evento[]>();
  for (const e of eventos) {
    if (e.metaId !== meta.id && !livre(e.metaId)) continue;
    if (termo && !e.titulo.toLowerCase().includes(termo)) continue;
    const chave = e.titulo.trim().toLowerCase();
    grupos.set(chave, [...(grupos.get(chave) ?? []), e]);
  }
  const gruposVisiveis = [...grupos.values()].sort((a, b) => Number(b.some((e) => e.metaId === meta.id)) - Number(a.some((e) => e.metaId === meta.id)) || a[0].titulo.localeCompare(b[0].titulo));
  const eventosLigados = eventos.filter((e) => e.metaId === meta.id).length;

  return (
    <Modal aberto titulo={T.metas.ligarTarefasDe(meta.nome)} aoFechar={aoFechar}>
      <div className="formulario">
        <Campo id="mt-busca-tarefa" rotulo={T.metas.buscarTarefa} dica={`${T.metas.tarefasLigadas(ligadas)} · ${T.metas.eventosLigados(eventosLigados)}`}>
          <input id="mt-busca-tarefa" className="campo" value={busca} maxLength={80} onChange={(e) => setBusca(e.target.value)} />
        </Campo>
        {gruposVisiveis.length > 0 && (
          <>
            <span className="campo-rotulo">{T.metas.eventosDoCalendario}</span>
            <ul className="mt-ligar-lista">
              {gruposVisiveis.map((grupo) => {
                const ligado = grupo.every((e) => e.metaId === meta.id);
                return (
                  <li key={grupo[0].id}>
                    <button type="button" className="mt-ligar-item" aria-pressed={ligado} onClick={() => grupo.forEach((e) => atualizarEvento(e.id, { metaId: ligado ? undefined : meta.id }))}>
                      <span className="mt-ligar-marca">{ligado && <Check size={12} />}</span>
                      <span className="mt-ligar-titulo cortar">{grupo[0].titulo}</span>
                      <span className="mt-ligar-data">{grupo.length > 1 ? T.metas.quantosEventos(grupo.length) : grupo[0].repeticao !== "nenhuma" ? T.calendario.repeticoes[grupo[0].repeticao] : formatar(grupo[0].data, "d/MM")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <span className="campo-rotulo">{T.calendario.fontes.tarefas}</span>
          </>
        )}
        {visiveis.length === 0 ? (
          <p className="campo-dica">{T.metas.semTarefasParaLigar}</p>
        ) : (
          <ul className="mt-ligar-lista">
            {visiveis.map((t) => {
              const ligada = t.metaId === meta.id;
              return (
                <li key={t.id}>
                  <button type="button" className="mt-ligar-item" aria-pressed={ligada} onClick={() => atualizar(t.id, { metaId: ligada ? undefined : meta.id })}>
                    <span className="mt-ligar-marca">{ligada && <Check size={12} />}</span>
                    <span className="mt-ligar-titulo cortar" data-feita={t.status === "concluida" ? "sim" : "nao"}>{t.titulo}</span>
                    {t.data && <span className="mt-ligar-data">{formatar(t.data, "d/MM")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="formulario-acoes">
          <Botao variante="primario" onClick={aoFechar}>{T.geral.fechar}</Botao>
        </div>
      </div>
    </Modal>
  );
}

function FormVisao({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const criar = useOrganizacao((s) => s.criarVisao);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [estado, setEstado] = useState<CartaoVisao["estado"]>("planejada");
  const [prazo, setPrazo] = useState("");
  const [imagem, setImagem] = useState<string | undefined>();
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (aberto) {
      setTitulo("");
      setDescricao("");
      setPrazo("");
      setImagem(undefined);
      setErros({});
    }
  }, [aberto]);

  return (
    <Modal aberto={aberto} titulo={T.metas.novoCartaoVisao} aoFechar={aoFechar}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const novos: Record<string, string> = {};
          if (!titulo.trim()) novos.titulo = T.validacao.obrigatorio;
          if (prazo && !dataValida(prazo)) novos.prazo = T.validacao.dataInvalida;
          setErros((x) => ({ ...novos, imagem: x.imagem ?? "" }));
          if (Object.keys(novos).length) return;
          criar({ titulo: titulo.trim().slice(0, 80), descricao: descricao.trim().slice(0, 300), estado, prazo: prazo || undefined, imagem });
          aoFechar();
        }}
      >
        <Campo id="v-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={erros.titulo}>
          <input id="v-titulo" className="campo" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <Campo id="v-desc" rotulo={T.financas.descricao}>
          <textarea id="v-desc" className="area-texto" value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="v-estado" rotulo={T.metas.estado}>
            <select id="v-estado" className="seletor" value={estado} onChange={(e) => setEstado(e.target.value as CartaoVisao["estado"])}>
              {(Object.keys(T.metas.estados) as CartaoVisao["estado"][]).map((s) => <option key={s} value={s}>{T.metas.estados[s]}</option>)}
            </select>
          </Campo>
          <Campo id="v-prazo" rotulo={T.financas.prazo} erro={erros.prazo}>
            <input id="v-prazo" type="date" className="campo" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
        </div>
        <Campo id="v-img" rotulo={T.metas.imagem} erro={erros.imagem || undefined} dica={T.validacao.imagemInvalida}>
          <input
            id="v-img"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="campo"
            style={{ paddingTop: 6 }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setImagem(await lerImagemComoDataUrl(f));
                setErros((x) => ({ ...x, imagem: "" }));
              } catch {
                setImagem(undefined);
                setErros((x) => ({ ...x, imagem: T.validacao.imagemInvalida }));
              }
            }}
          />
        </Campo>
        {imagem && <img src={imagem} alt="" className="visao-previa" />}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

export default function Metas() {
  const org = useOrganizacao();
  const tarefas = useRotina((s) => s.tarefas);
  const progresso = useProgresso();
  const avisar = useInterface((s) => s.avisar);
  const [novaMeta, setNovaMeta] = useState(false);
  const [novaVisao, setNovaVisao] = useState(false);
  const [criandoPilar, setCriandoPilar] = useState(false);
  const [novoPilar, setNovoPilar] = useState("");
  const [erroPilar, setErroPilar] = useState("");
  const [atualizando, setAtualizando] = useState<Meta | null>(null);
  const [valor, setValor] = useState("");
  const [excluir, setExcluir] = useState<Meta | null>(null);
  const [ligando, setLigando] = useState<Meta | null>(null);
  const [vendoQuadro, setVendoQuadro] = useState<Meta | null>(null);
  const [editando, setEditando] = useState<Meta | null>(null);
  const excluirMeta = (meta: Meta) => {
    desligarDaMeta(meta.id);
    org.excluirMeta(meta.id);
  };

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "metas") setNovaMeta(true);
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const medias = org.metas.map((m) => {
    const p = progresso(m);
    return Math.min(1, p.atual / Math.max(1, p.alvo));
  });
  const media = medias.length ? Math.round((medias.reduce((a, b) => a + b, 0) / medias.length) * 100) : 0;

  return (
    <>
      <CabecalhoAba
        titulo={T.metas.titulo}
        subtitulo={T.metas.subtitulo}
        acoes={
          <>
            <Botao className="mt-botao-cabecalho" icone={<Plus size={13} />} onClick={() => setCriandoPilar(true)}>{T.metas.novoPilar}</Botao>
            <Botao className="mt-botao-cabecalho" variante="primario" icone={<Plus size={13} />} onClick={() => setNovaMeta(true)}>{T.metas.novaMeta}</Botao>
          </>
        }
      />

      <section className="bento mt-numeros">
        <div className="mt-numero"><span className="mt-numero-valor">{org.metas.length}</span><span className="mt-numero-rotulo">{T.metas.metasAtivas}</span></div>
        <div className="mt-numero"><span className="mt-numero-valor">{tarefas.filter((t) => t.status === "concluida").length}</span><span className="mt-numero-rotulo">{T.metas.tarefasConcluidas}</span></div>
        <div className="mt-numero"><span className="mt-numero-valor" data-destaque="sim">{media}%</span><span className="mt-numero-rotulo">{T.metas.progressoMedio}</span></div>
      </section>

      <section className="mt-secao">
        <header className="secao-cabecalho">
          <span className="secao-titulo">{T.metas.pilares}</span>
          <span className="tracejado" />
          <span className="secao-extra">{org.pilares.length}</span>
        </header>
        <div className="mt-pilares">
          {org.pilares.map((p, n) => {
            const quantas = org.metas.filter((m) => m.pilarId === p.id).length;
            return (
              <div key={p.id} className="mt-pilar" style={{ "--cor": COR_PILAR[n % COR_PILAR.length], "--nota": `${p.nota * 10}%` } as CSSProperties}>
                <span className="mt-pilar-anel"><span>{p.nota}</span></span>
                <span className="mt-pilar-texto">
                  <span className="mt-pilar-nome cortar">{p.nome}</span>
                  <span className="mt-pilar-metas">{T.metas.quantasMetas(quantas)}</span>
                  <span className="mt-pilar-nota" role="group" aria-label={`${T.metas.nota} ${p.nome}`}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`${T.metas.nota} ${i + 1}`}
                        aria-pressed={i < p.nota}
                        title={String(i + 1)}
                        onClick={() => org.atualizarPilar(p.id, { nota: p.nota === i + 1 ? i : i + 1 })}
                      />
                    ))}
                  </span>
                </span>
                <button type="button" className="mt-icone-excluir" aria-label={T.metas.excluirPilar(p.nome)} title={T.metas.excluirPilar(p.nome)} onClick={() => org.excluirPilar(p.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-metas">
        <header className="secao-cabecalho mt-metas-cabecalho">
          <span className="secao-titulo">{T.metas.ativas}</span>
          <span className="tracejado" />
        </header>
        {org.metas.length === 0 ? (
          <Vazio icone={<Target size={28} />} titulo={T.metas.semMetas} acao={<Botao variante="primario" onClick={() => setNovaMeta(true)}>{T.metas.novaMeta}</Botao>} />
        ) : org.metas.map((m) => {
          const p = progresso(m);
          const pct = Math.min(1, p.atual / Math.max(1, p.alvo));
          const pctTexto = `${Math.round(pct * 100)}%`;
          return (
            <div key={m.id} className="mt-meta">
              <span className="mt-meta-nome">
                <span className="cortar">{m.nome}</span>
                <span className="mt-meta-sub">{T.metas.subtituloMeta(org.pilares.find((x) => x.id === m.pilarId)?.nome ?? "", T.metas.tipos[m.tipo])}</span>
              </span>
              <span className="mt-meta-progresso">
                <span className="mt-meta-valores"><span>{p.rotulo}</span><span>{pctTexto}</span></span>
                <span className="mt-trilho" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={m.nome}>
                  <span style={{ width: pctTexto }} data-alto={pct >= 0.8 ? "sim" : "nao"} />
                </span>
              </span>
              <span className="mt-meta-fim">
                <span className="mt-meta-periodo">{m.periodo === "ano" ? T.metas.ano : T.metas.trimestre}</span>
                <span className={`etiqueta ${pct >= 1 ? "etiqueta-sucesso" : "etiqueta-info"}`}>{pct >= 1 ? T.metas.estados.concluida : T.metas.estados.em_andamento}</span>
                <span className="mt-meta-acoes">
                  {m.tipo === "tarefas" && <Botao pequeno soIcone variante="fantasma" icone={<Link2 size={13} />} aria-label={T.metas.ligarTarefas} title={T.metas.ligarTarefas} onClick={() => setLigando(m)} />}
                  {m.tipo === "tarefas" && <Botao pequeno soIcone variante="fantasma" icone={<Columns3 size={13} />} aria-label={T.metas.verQuadro} title={T.metas.verQuadro} onClick={() => setVendoQuadro(m)} />}
                  {m.tipo === "manual" && <Botao pequeno soIcone variante="fantasma" icone={<TrendingUp size={13} />} aria-label={T.metas.atualizarValor} title={T.metas.atualizarValor} onClick={() => { setAtualizando(m); setValor(String(m.atual)); }} />}
                  <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.metas.editarMeta} title={T.metas.editarMeta} onClick={() => setEditando(m)} />
                  <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} title={T.geral.excluir} onClick={() => setExcluir(m)} />
                </span>
              </span>
            </div>
          );
        })}
      </section>

      <section className="mt-secao">
        <header className="secao-cabecalho">
          <span className="secao-titulo">{T.metas.visao}</span>
          <span className="tracejado" />
          <Botao pequeno icone={<Plus size={12} />} onClick={() => setNovaVisao(true)}>{T.metas.novoCartaoVisao}</Botao>
        </header>
        {org.visao.length === 0 ? (
          <div className="mt-visao-vazio"><Vazio icone={<ImagePlus size={24} />} titulo={T.metas.semVisao} /></div>
        ) : (
          <div className="mt-visao">
            {org.visao.map((v) => {
              const dias = v.prazo ? diasAte(v.prazo) : null;
              return (
                <article key={v.id} className="mt-cartao">
                  <div className="mt-cartao-imagem">
                    {v.imagem ? <img src={v.imagem} alt="" /> : <IconeImagem size={22} className="mt-cartao-sem-imagem" />}
                    <select className="mt-chip mt-chip-estado" data-estado={v.estado} value={v.estado} aria-label={T.metas.estado} onChange={(e) => org.atualizarVisao(v.id, { estado: e.target.value as CartaoVisao["estado"] })}>
                      {(Object.keys(T.metas.estados) as CartaoVisao["estado"][]).map((s) => <option key={s} value={s}>{T.metas.estados[s]}</option>)}
                    </select>
                    {v.prazo && <span className="mt-chip mt-chip-prazo">{formatar(v.prazo, "MMM yyyy")}</span>}
                  </div>
                  <div className="mt-cartao-corpo">
                    <div className="mt-cartao-texto">
                      <b className="mt-cartao-titulo">{v.titulo}</b>
                      {v.descricao && <span className="mt-cartao-descricao">{`“${v.descricao}”`}</span>}
                    </div>
                    <div className="mt-cartao-rodape">
                      <span className="mt-cartao-falta">{dias === null ? T.metas.semPrazo : T.metas.faltamDias(dias)}</span>
                      <button type="button" className="mt-icone-excluir mt-icone-visivel" aria-label={T.geral.excluir} title={T.geral.excluir} onClick={() => { org.excluirVisao(v.id); avisar(T.geral.excluido); }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Modal aberto={criandoPilar} titulo={T.metas.novoPilar} aoFechar={() => { setCriandoPilar(false); setErroPilar(""); }}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!novoPilar.trim()) return setErroPilar(T.validacao.obrigatorio);
            org.criarPilar(novoPilar);
            setNovoPilar("");
            setErroPilar("");
            setCriandoPilar(false);
          }}
        >
          <Campo id="mt-pilar-nome" rotulo={T.metas.nomePilar} obrigatorio erro={erroPilar}>
            <input id="mt-pilar-nome" className="campo" value={novoPilar} maxLength={40} onChange={(e) => { setNovoPilar(e.target.value); setErroPilar(""); }} />
          </Campo>
          <div className="formulario-acoes">
            <Botao onClick={() => { setCriandoPilar(false); setErroPilar(""); }}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
          </div>
        </form>
      </Modal>
      <FormMeta aberto={novaMeta || !!editando} meta={editando} aoFechar={() => { setNovaMeta(false); setEditando(null); }} />
      <FormVisao aberto={novaVisao} aoFechar={() => setNovaVisao(false)} />
      <Modal aberto={!!atualizando} titulo={T.metas.atualizarValor} aoFechar={() => setAtualizando(null)}>
        {atualizando && (
          <form
            className="formulario"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(valor.replace(",", "."));
              if (!Number.isFinite(n) || n < 0) return;
              org.registrarProgresso(atualizando.id, n);
              if (n >= atualizando.alvo) void tocarSom("proud", "personagens");
              setAtualizando(null);
            }}
          >
            <Campo id="mt-valor" rotulo={T.metas.atual} dica={`${T.metas.alvo}: ${atualizando.alvo}`}>
              <input id="mt-valor" className="campo" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))} />
            </Campo>
            <div className="formulario-acoes">
              <Botao onClick={() => setAtualizando(null)}>{T.geral.cancelar}</Botao>
              <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmarModal aberto={!!excluir} titulo={T.geral.confirmarExclusao} texto={excluir?.nome ?? ""} aoFechar={() => setExcluir(null)} aoConfirmar={() => excluir && excluirMeta(excluir)} />
      <LigarTarefas meta={ligando} aoFechar={() => setLigando(null)} />
      <Modal aberto={!!vendoQuadro} largo titulo={vendoQuadro ? T.metas.quadroDe(vendoQuadro.nome) : ""} aoFechar={() => setVendoQuadro(null)}>
        {vendoQuadro && !tarefas.some((t) => t.metaId === vendoQuadro.id) && <p className="campo-dica">{T.metas.quadroVazio}</p>}
        {vendoQuadro && <div className="mt-quadro"><QuadroDeTarefas tarefas={tarefas.filter((t) => t.metaId === vendoQuadro.id)} variante="sistema" mostrarData semMeta /></div>}
      </Modal>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import { useConfig } from "../../estado/configuracoes";
import { NATIVO, focarSobreposta, informarAreaInterativa, janelaAtual, usarAreaInterativa } from "../../desktop/desktop";
import { controle, type AppInstalado } from "../../ponte/ponteLocal";
import { T } from "../../textos/textos";
import { atributosDoFundo, usarAparenciaDeBorda, variaveisDaBorda } from "../aparencia";
import { carregarIconesAssistive, listarAppsAssistive } from "./catalogo";
import { LIMITE_ATALHOS, TAMANHO_BOTAO, limitarPosicao, normalizarPosicao, posicaoNaTela, posicionarMenu, type AtalhoAssistive, type PosicaoAssistive } from "./regras";
import "./assistive.css";

const C = T.assistive;
const MOLA = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };
const lerTela = () => ({ largura: window.innerWidth, altura: window.innerHeight });

function usarIcones(ids: string[], ativo = true) {
  const [icones, setIcones] = useState<Record<string, string | null>>({});
  const assinatura = JSON.stringify(ids);
  useEffect(() => {
    if (!ativo || !ids.length) return;
    let vivo = true;
    void carregarIconesAssistive(JSON.parse(assinatura) as string[]).then((r) => { if (vivo) setIcones(r); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [assinatura, ativo]);
  return icones;
}

function IconeApp({ app, icone }: { app: AtalhoAssistive; icone?: string | null }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [icone]);
  return <span className="assistive-icone-app">{icone && !falhou ? <img src={icone} alt="" draggable={false} onError={() => setFalhou(true)} /> : <span>{app.nome.trim().slice(0, 1).toUpperCase()}</span>}</span>;
}

function SeletorApps({ aoAdicionar }: { aoAdicionar: (app: AppInstalado, origem: DOMRect, icone: string | null) => void }) {
  const atalhos = useConfig((s) => s.assistive.apps);
  const [apps, setApps] = useState<AppInstalado[]>([]);
  const [consulta, setConsulta] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [quantidade, setQuantidade] = useState(24);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let vivo = true;
    campo.current?.focus();
    setCarregando(true); setErro(false);
    void listarAppsAssistive(tentativa > 0).then((r) => { if (vivo) setApps(r); }).catch(() => { if (vivo) setErro(true); }).finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [tentativa]);
  const normalizar = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
  const filtrados = apps.filter((a) => normalizar(a.nome).includes(normalizar(consulta)));
  const visiveis = filtrados.slice(0, quantidade);
  const icones = usarIcones(visiveis.map((a) => a.id));
  return <div className="assistive-seletor">
    <label className="assistive-busca"><Search size={17} /><input ref={campo} value={consulta} onChange={(e) => { setConsulta(e.target.value); setQuantidade(24); }} placeholder={C.buscar} aria-label={C.buscar} />{consulta && <button type="button" aria-label={T.geral.limpar} onClick={() => { setConsulta(""); campo.current?.focus(); }}><X size={15} /></button>}</label>
    <div className="assistive-catalogo">
      {carregando ? <div className="assistive-mensagem"><LoaderCircle size={22} className="girando" /><p>{C.carregando}</p></div> : erro ? <div className="assistive-mensagem"><p>{C.falhaLista}</p><button className="assistive-acao" onClick={() => setTentativa((n) => n + 1)}>{C.tentar}</button></div> : !filtrados.length ? <p className="assistive-mensagem">{C.semApps}</p> : visiveis.map((app) => {
        const adicionado = atalhos.some((a) => a.id === app.id);
        return <button type="button" key={app.id} className="assistive-app-lista" aria-label={adicionado ? C.adicionado(app.nome) : `${C.adicionar}: ${app.nome}`} disabled={adicionado || atalhos.length >= LIMITE_ATALHOS} onClick={(e) => aoAdicionar(app, e.currentTarget.querySelector(".assistive-icone-app")!.getBoundingClientRect(), icones[app.id] ?? null)}>
          <IconeApp app={app} icone={icones[app.id]} /><span>{app.nome}</span>{adicionado ? <Check size={17} /> : <Plus size={17} />}
        </button>;
      })}
      {!erro && filtrados.length > quantidade && <button type="button" className="assistive-mais" onClick={() => setQuantidade((n) => n + 24)}>{C.mais}</button>}
    </div>
    <span className="assistive-contagem">{atalhos.length >= LIMITE_ATALHOS ? C.limite : C.contagem(atalhos.length)}</span>
  </div>;
}

function AssistiveAtivo() {
  const cfg = useConfig((s) => s.assistive);
  const definir = useConfig((s) => s.definirAssistive);
  const reduzido = useConfig((s) => s.reduzirAnimacoes);
  const semMovimento = useReducedMotion() || reduzido;
  const fundo = useConfig((s) => cfg.origemCor === "dock" ? s.dock.fundo : s.ilha.fundo);
  const opacidade = useConfig((s) => cfg.origemCor === "dock" ? s.dock.opacidade : s.ilha.opacidade);
  const aparencia = usarAparenciaDeBorda(fundo, opacidade);
  const [aberto, setAberto] = useState(cfg.fixado);
  const [pagina, setPagina] = useState<"atalhos" | "adicionar">("atalhos");
  const [arrastando, setArrastando] = useState(false);
  const [tela, setTela] = useState(lerTela);
  const [posicao, setPosicao] = useState(() => posicaoNaTela(cfg.posicao, lerTela()));
  const [altura, setAltura] = useState(360);
  const [aviso, setAviso] = useState("");
  const [falhaAoAbrir, setFalhaAoAbrir] = useState(false);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [voo, setVoo] = useState<{ app: AtalhoAssistive; icone: string | null; origem: PosicaoAssistive; destino: PosicaoAssistive | null } | null>(null);
  const ocupado = useRef(false);
  const raiz = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const gesto = useRef<{ id: number; x: number; y: number; origem: PosicaoAssistive; moveu: boolean } | null>(null);
  const suprimirClique = useRef(false);
  const [remocao, setRemocao] = useState<{ id: string; x: number; y: number } | null>(null);
  const removerBotao = useRef<HTMLButtonElement>(null);
  const remocaoAtual = useRef(remocao);
  remocaoAtual.current = remocao;
  const suprimirAbertura = useRef(false);
  const pressao = useRef<{ x: number; y: number; temporizador: number } | null>(null);
  const cancelarPressao = useCallback(() => {
    if (pressao.current) window.clearTimeout(pressao.current.temporizador);
    pressao.current = null;
  }, []);
  const pedirRemocao = (app: AtalhoAssistive, elemento: HTMLElement) => {
    const r = elemento.getBoundingClientRect();
    setRemocao({ id: app.id, x: Math.max(12, Math.min(tela.largura - 172, r.right + 168 < tela.largura ? r.right + 8 : r.left - 168)), y: Math.max(12, Math.min(tela.altura - 52, r.top)) });
  };
  const x = useMotionValue(posicao.x), y = useMotionValue(posicao.y);
  const icones = usarIcones(cfg.apps.map((a) => a.id), aberto);
  const menu = posicionarMenu(posicao, tela, altura, pagina === "adicionar" ? 280 : 44);
  const integrado = aberto && pagina === "atalhos";
  const inicioGaveta = Math.min(posicao.y, menu.y);
  const alturaGaveta = Math.max(posicao.y + TAMANHO_BOTAO, menu.y + menu.altura) - inicioGaveta;
  usarAreaInterativa([".assistive-botao", ".assistive-painel", ".assistive-capsula", ".assistive-remover", ".assistive-raiz[data-arrastando='true']"]);

  const fechar = useCallback(() => { setAberto(false); setPagina("atalhos"); setRemocao(null); cancelarPressao(); }, [cancelarPressao]);
  useEffect(() => {
    document.addEventListener("pointerup", cancelarPressao);
    document.addEventListener("pointercancel", cancelarPressao);
    return () => {
      cancelarPressao();
      document.removeEventListener("pointerup", cancelarPressao);
      document.removeEventListener("pointercancel", cancelarPressao);
    };
  }, [cancelarPressao]);
  useEffect(() => { if (remocao) removerBotao.current?.focus(); }, [remocao]);
  useEffect(() => {
    if (!aberto || pagina !== "atalhos" || (remocao && !cfg.apps.some((a) => a.id === remocao.id))) setRemocao(null);
  }, [aberto, pagina, cfg.apps, remocao]);
  useEffect(() => {
    const redimensionar = () => setTela(lerTela());
    window.addEventListener("resize", redimensionar);
    return () => window.removeEventListener("resize", redimensionar);
  }, []);
  useEffect(() => {
    const p = posicaoNaTela(cfg.posicao, tela);
    setPosicao(p); x.set(p.x); y.set(p.y);
  }, [cfg.posicao.x, cfg.posicao.y, tela, x, y]);
  useEffect(() => { if (cfg.fixado) setAberto(true); }, [cfg.fixado]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (e.target instanceof Element && !e.target.closest(".assistive-remover")) setRemocao(null);
      if (!cfg.fixado && e.target instanceof Node && !raiz.current?.contains(e.target)) fechar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); if (remocaoAtual.current) setRemocao(null); else fechar(); botao.current?.focus(); } };
    const desfocar = () => { cancelarPressao(); setRemocao(null); if (!cfg.fixado) fechar(); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("blur", desfocar);
    if (NATIVO) void janelaAtual().then((j) => focarSobreposta(j)).catch(() => undefined);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", tecla); window.removeEventListener("blur", desfocar); };
  }, [aberto, cfg.fixado, fechar, cancelarPressao]);
  useEffect(() => {
    if (!aberto || !painel.current) return;
    const elemento = painel.current;
    const medir = () => setAltura(elemento.scrollHeight + 2);
    const observador = new ResizeObserver(medir);
    observador.observe(elemento); medir();
    return () => observador.disconnect();
  }, [aberto, pagina]);
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(""), 4500);
    return () => window.clearTimeout(t);
  }, [aviso]);
  useEffect(() => {
    if (!voo || voo.destino) return;
    if (!aberto || semMovimento) { setVoo(null); return; }
    const observador = new MutationObserver(encontrarDestino);
    function encontrarDestino() {
      const alvo = [...(raiz.current?.querySelectorAll<HTMLElement>("[data-atalho-id]") ?? [])].find((el) => el.dataset.atalhoId === voo?.app.id)?.querySelector(".assistive-icone-app");
      if (!alvo) return;
      const r = alvo.getBoundingClientRect();
      observador.disconnect();
      setVoo((atual) => atual && { ...atual, destino: { x: r.left + r.width / 2 - 16, y: r.top + r.height / 2 - 16 } });
    }
    if (raiz.current) observador.observe(raiz.current, { childList: true, subtree: true });
    encontrarDestino();
    const limite = window.setTimeout(() => setVoo(null), 1200);
    return () => { observador.disconnect(); window.clearTimeout(limite); };
  }, [voo?.app.id, aberto, semMovimento]);
  useEffect(() => {
    const esconder = () => { if (document.hidden) setVoo(null); };
    document.addEventListener("visibilitychange", esconder);
    return () => document.removeEventListener("visibilitychange", esconder);
  }, []);
  useEffect(() => { if (!aberto || semMovimento) setVoo(null); }, [aberto, semMovimento]);

  const salvarPosicao = (p: PosicaoAssistive) => { setPosicao(p); x.set(p.x); y.set(p.y); definir({ posicao: normalizarPosicao(p, tela) }); };
  const terminarGesto = (e: React.PointerEvent<HTMLButtonElement>, cancelar = false) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    gesto.current = null; setArrastando(false);
    if (NATIVO) void informarAreaInterativa([...document.querySelectorAll(".assistive-botao, .assistive-painel, .assistive-capsula, .assistive-remover")].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }));
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.moveu) { suprimirClique.current = true; salvarPosicao(cancelar ? g.origem : limitarPosicao({ x: x.get(), y: y.get() }, tela)); }
  };
  const abrirApp = async (app: AtalhoAssistive) => {
    if (!useConfig.getState().assistive.apps.some((a) => a.id === app.id)) return;
    if (ocupado.current) return;
    ocupado.current = true; setAbrindo(app.id); setAviso(""); setFalhaAoAbrir(false);
    try { await controle.abrirApp(app.id); if (!useConfig.getState().assistive.fixado) fechar(); }
    catch { setFalhaAoAbrir(true); setAviso(C.falhaAbrir(app.nome)); }
    finally { ocupado.current = false; setAbrindo(null); }
  };
  const adicionar = (app: AppInstalado, origem: DOMRect, icone: string | null) => {
    const atual = useConfig.getState().assistive.apps;
    if (atual.some((a) => a.id === app.id) || atual.length >= LIMITE_ATALHOS) return;
    definir({ apps: [...atual, { id: app.id, nome: app.nome }] });
    if (!semMovimento) setVoo({ app, icone, origem: { x: origem.left + origem.width / 2 - 16, y: origem.top + origem.height / 2 - 16 }, destino: null });
    setPagina("atalhos"); setFalhaAoAbrir(false); setAviso(C.adicionado(app.nome));
  };

  return <div ref={raiz} className="assistive-raiz" data-arrastando={arrastando || undefined} {...atributosDoFundo(aparencia)} style={variaveisDaBorda(aparencia)}>
    <motion.button ref={botao} type="button" className="assistive-botao" data-integrado={integrado || undefined} style={{ x, y, opacity: aberto || arrastando ? 1 : cfg.opacidade }} aria-label={aberto ? C.fechar : C.abrir} aria-expanded={aberto} aria-controls="assistive-painel" title={C.arrastar}
      whileHover={semMovimento ? { opacity: 1 } : { opacity: 1, scale: 1.045 }} whileTap={semMovimento ? undefined : { scale: 0.95 }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        suprimirClique.current = false;
        gesto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, origem: { x: x.get(), y: y.get() }, moveu: false };
        e.currentTarget.setPointerCapture(e.pointerId);
        if (NATIVO) void informarAreaInterativa([{ x: 0, y: 0, w: tela.largura, h: tela.altura }]);
      }}
      onPointerMove={(e) => {
        const g = gesto.current;
        if (!g || g.id !== e.pointerId) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.moveu && Math.hypot(dx, dy) < 6) return;
        if (!g.moveu) { g.moveu = true; setArrastando(true); fechar(); }
        const p = limitarPosicao({ x: g.origem.x + dx, y: g.origem.y + dy }, tela);
        x.set(p.x); y.set(p.y);
      }}
      onPointerUp={(e) => terminarGesto(e)} onPointerCancel={(e) => terminarGesto(e, true)} onLostPointerCapture={(e) => terminarGesto(e, true)}
      onClick={(e) => { if (suprimirClique.current && e.detail !== 0) { suprimirClique.current = false; return; } if (aberto) fechar(); else { setAberto(true); setPagina("atalhos"); } }}
      onKeyDown={(e) => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!delta) return;
        e.preventDefault(); const passo = e.shiftKey ? 32 : 12;
        salvarPosicao(limitarPosicao({ x: x.get() + delta[0] * passo, y: y.get() + delta[1] * passo }, tela));
      }}><span className="assistive-anel"><span /></span></motion.button>
    <AnimatePresence>
      {integrado && <motion.div className="assistive-capsula" style={{ left: menu.x, width: menu.largura }} initial={{ top: posicao.y, height: TAMANHO_BOTAO, opacity: 0.8 }} animate={{ top: inicioGaveta, height: alturaGaveta, opacity: 1 }} exit={{ top: posicao.y, height: TAMANHO_BOTAO, opacity: 0 }} transition={semMovimento ? { duration: 0.08 } : MOLA} />}
    </AnimatePresence>
    <AnimatePresence>
      {aberto && <motion.section ref={painel} id="assistive-painel" className="assistive-painel" role="dialog" aria-label={C.titulo} data-pagina={pagina} data-direcao={menu.acima ? "cima" : "baixo"} style={{ left: menu.x, top: menu.y, width: menu.largura, maxHeight: menu.altura, transformOrigin: `50% ${menu.acima ? "100%" : "0%"}` }}
        initial={semMovimento ? { opacity: 0 } : { opacity: 0, scaleY: 0.7, scaleX: 0.96, y: menu.acima ? 10 : -10 }} animate={{ opacity: 1, scaleY: 1, scaleX: 1, y: 0 }} exit={semMovimento ? { opacity: 0 } : { opacity: 0, scaleY: 0.8, scaleX: 0.98, y: menu.acima ? 6 : -6 }} transition={semMovimento ? { duration: 0.08 } : MOLA}>
        {pagina === "adicionar" && <header className="assistive-cabecalho"><button className="assistive-ferramenta" aria-label={C.voltar} onClick={() => setPagina("atalhos")}><ArrowLeft size={16} /></button><b>{C.escolher}</b><button className="assistive-ferramenta" aria-label={C.fechar} onClick={fechar}><X size={16} /></button></header>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pagina} initial={semMovimento ? { opacity: 1 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: semMovimento ? 0 : -5 }} transition={{ duration: semMovimento ? 0 : 0.14 }}>
            {pagina === "adicionar" ? <SeletorApps aoAdicionar={adicionar} /> : <>
              <div className="assistive-grade">
                <AnimatePresence initial={false}>
                  {cfg.apps.map((app) => <motion.div key={app.id} data-atalho-id={app.id} className={`assistive-celula${voo?.app.id === app.id ? " assistive-em-voo" : ""}`} layout={!semMovimento} initial={semMovimento ? false : { opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: semMovimento ? 1 : 0.8 }} transition={semMovimento ? { duration: 0 } : MOLA}>
                    <motion.button type="button" className="assistive-atalho" aria-label={C.abrirApp(app.nome)} title={app.nome} disabled={abrindo !== null}
                      onContextMenu={(e) => { e.preventDefault(); cancelarPressao(); pedirRemocao(app, e.currentTarget); }}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || !e.isPrimary) return;
                        cancelarPressao(); suprimirAbertura.current = false;
                        if (e.pointerType === "mouse") return;
                        const alvo = e.currentTarget;
                        pressao.current = { x: e.clientX, y: e.clientY, temporizador: window.setTimeout(() => {
                          suprimirAbertura.current = true; pedirRemocao(app, alvo); pressao.current = null;
                        }, 450) };
                      }}
                      onPointerMove={(e) => { if (pressao.current && Math.hypot(e.clientX - pressao.current.x, e.clientY - pressao.current.y) > 8) cancelarPressao(); }}
                      onPointerCancel={cancelarPressao}
                      onKeyDown={(e) => { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); pedirRemocao(app, e.currentTarget); } }}
                      onClick={() => { if (suprimirAbertura.current) { suprimirAbertura.current = false; return; } setRemocao(null); void abrirApp(app); }} whileHover={semMovimento ? undefined : { scale: 1.08 }} whileTap={semMovimento ? undefined : { scale: 0.93 }}>
                      {abrindo === app.id ? <span className="assistive-icone-app"><LoaderCircle className="girando" size={19} /></span> : <IconeApp app={app} icone={icones[app.id]} />}
                    </motion.button>
                  </motion.div>)}
                </AnimatePresence>
                <motion.button type="button" className="assistive-adicionar" aria-label={C.adicionar} title={C.adicionar} disabled={cfg.apps.length >= LIMITE_ATALHOS} onClick={() => setPagina("adicionar")} whileTap={semMovimento ? undefined : { scale: 0.94 }}><Plus size={20} strokeWidth={1.5} /></motion.button>
              </div>
            </>}
          </motion.div>
        </AnimatePresence>
      </motion.section>}
    </AnimatePresence>
    {aviso && <div className={falhaAoAbrir ? "assistive-aviso" : "assistive-status"} role={falhaAoAbrir ? "alert" : "status"} style={falhaAoAbrir ? { right: 16, bottom: 24 } : undefined}>{aviso}</div>}
    {voo && !semMovimento && <motion.span key={voo.app.id} className="assistive-app-voando" aria-hidden="true" initial={{ x: voo.origem.x, y: voo.origem.y, opacity: 1, scale: 0.8 }} animate={voo.destino ? { x: [voo.origem.x, (voo.origem.x + voo.destino.x) / 2, voo.destino.x], y: [voo.origem.y, Math.min(voo.origem.y, voo.destino.y) - 28, voo.destino.y], scale: [0.8, 1.1, 1], rotate: [0, -6, 0] } : { x: voo.origem.x, y: voo.origem.y }} transition={{ duration: 0.48, ease: [0.22, 0.7, 0.3, 1], times: [0, 0.5, 1] }} onAnimationComplete={() => { if (voo.destino) setVoo(null); }}><IconeApp app={voo.app} icone={voo.icone} /></motion.span>}
    {remocao && <div className="assistive-remover" role="menu" style={{ left: remocao.x, top: remocao.y }}>
      <button ref={removerBotao} type="button" role="menuitem" onClick={() => {
        definir({ apps: useConfig.getState().assistive.apps.filter((a) => a.id !== remocao.id) });
        setRemocao(null); setFalhaAoAbrir(false); setAviso(C.removido); botao.current?.focus();
      }}><Trash2 size={15} />{C.removerAtalho}</button>
    </div>}
  </div>;
}

export function AssistiveTouch() {
  const ativo = useConfig((s) => s.assistive.ativo);
  useEffect(() => { if (!ativo && NATIVO) void informarAreaInterativa([]); }, [ativo]);
  return ativo ? <AssistiveAtivo /> : null;
}

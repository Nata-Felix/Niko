import { useEffect, useRef, useState } from "react";
import { ArrowLeft, AtSign, EyeOff, Forward, Paperclip, Play, Send, Settings2 } from "lucide-react";
import { T } from "../../textos/textos";
import { useWhatsapp } from "../../estado/whatsapp";
import { avisoLigado, useIlha } from "../../estado/ilha";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { tocarSom } from "../../ponte/sons";
import { corDoNome, iniciaisDoNome, whatsappPonte, type ConversaWhatsapp, type MensagemWhatsapp, type NovidadeWhatsapp } from "../../ponte/whatsapp";
import { horarioRelativo } from "../../utilitarios/datas";
import { formatarTamanho } from "../../utilitarios/anexos";
import { mensagemDoWhatsapp } from "../../modulos/conexoes/ConexaoWhatsapp";

const W = T.whatsapp;
const NOVIDADES_MS = 4000;
const ESTADO_MS = 30_000;

function anunciar(itens: NovidadeWhatsapp[]) {
  if (itens.length === 0 || useConfig.getState().naoPerturbe || !avisoLigado("conexoes")) return;
  const ilha = useIlha.getState();
  if (ilha.estado === "expandida" && ilha.aba === "whatsapp") return;
  const nomes = [...new Set(itens.map((i) => i.nome))];
  const texto = nomes.length === 1 ? W.mensagemDe(nomes[0]) : W.mensagensDe(nomes.slice(0, 3).join(", "));
  if (ilha.revelar({ texto, tipo: "info", marca: "whatsapp", aba: "whatsapp", categoria: "conexoes" }, 4000, "normal")) void tocarSom("pop", "avisos");
}

export function usarAvisosDoWhatsapp(): boolean {
  const ligado = useWhatsapp((s) => Boolean(s.estado?.ligado));
  useEffect(() => {
    let vivo = true;
    let relogio: number | undefined;
    let seq = -1;
    let ultimaLeituraDoEstado = 0;
    const passo = async () => {
      let espera = ESTADO_MS;
      try {
        let estado = useWhatsapp.getState().estado;
        const precisaLer = !estado || Date.now() - ultimaLeituraDoEstado >= (estado.ligado && estado.vinculo !== "conectado" ? NOVIDADES_MS : ESTADO_MS);
        if (precisaLer) {
          estado = await useWhatsapp.getState().carregar();
          ultimaLeituraDoEstado = Date.now();
        }
        if (estado?.ligado && estado.vinculo === "conectado") {
          espera = NOVIDADES_MS;
          const novas = await whatsappPonte.novidades(seq < 0 ? estado.seq : seq);
          if (seq >= 0 && novas.itens.length > 0) {
            anunciar(novas.itens);
            void useWhatsapp.getState().carregar();
          }
          seq = novas.seq;
        } else if (estado?.ligado) espera = NOVIDADES_MS;
      } catch {
        espera = ESTADO_MS;
      }
      if (vivo) relogio = window.setTimeout(() => void passo(), espera);
    };
    void passo();
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
    };
  }, []);
  return ligado;
}

function Avatar({ nome, foto, tamanho = 30 }: { nome: string; foto?: string | null; tamanho?: number }) {
  if (foto) return <img className="whatsapp-avatar whatsapp-avatar-foto" src={foto} alt="" width={tamanho} height={tamanho} />;
  return (
    <span className="whatsapp-avatar" style={{ width: tamanho, height: tamanho, background: corDoNome(nome) }} aria-hidden="true">
      {iniciaisDoNome(nome)}
    </span>
  );
}

function rotuloDaMidia(m: MensagemWhatsapp): string {
  const tipo = W.midias[m.midia] ?? W.midias.outra;
  return m.midia === "documento" && m.nomeDoArquivo ? `${tipo}: ${m.nomeDoArquivo}` : tipo;
}

const MIDIAS_NA_HORA = new Set(["imagem", "figurinha"]);
const MIDIAS_COM_CLIQUE = new Set(["video", "audio"]);

function MidiaDaMensagem({ jid, m }: { jid: string; m: MensagemWhatsapp }) {
  const tipo = W.midias[m.midia] ?? W.midias.outra;
  const naHora = MIDIAS_NA_HORA.has(m.midia);
  const [pedida, setPedida] = useState(naHora);
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!pedida || m.visualizacaoUnica) return;
    let vivo = true;
    let criada: string | null = null;
    whatsappPonte
      .midia(jid, m.id)
      .then((u) => {
        criada = u;
        if (vivo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [pedida, jid, m.id, m.visualizacaoUnica]);

  if (m.visualizacaoUnica) return <span className="whatsapp-midia"><EyeOff size={11} /> {W.visualizacaoUnica(tipo)}</span>;
  if (!naHora && !MIDIAS_COM_CLIQUE.has(m.midia)) {
    const tamanho = m.tamanho ? ` (${formatarTamanho(m.tamanho)})` : "";
    return <span className="whatsapp-midia">{rotuloDaMidia(m)}{tamanho}</span>;
  }
  if (falhou) return <span className="whatsapp-midia">{W.midiaFalhou(tipo)}</span>;
  if (!pedida) {
    return (
      <button type="button" className="whatsapp-carregar-midia" onClick={() => setPedida(true)}>
        <Play size={11} /> {W.carregarMidia(tipo, m.tamanho ? formatarTamanho(m.tamanho) : "")}
      </button>
    );
  }
  if (!url) return <span className="whatsapp-midia-carregando" data-tipo={m.midia}>{W.carregandoMidia}</span>;
  if (m.midia === "video") return <video className="whatsapp-video" src={url} controls autoPlay />;
  if (m.midia === "audio") return <audio className="whatsapp-audio" src={url} controls autoPlay />;
  return <img className="whatsapp-imagem" data-tipo={m.midia} src={url} alt={tipo} />;
}

function previa(m: MensagemWhatsapp | undefined): string {
  if (!m) return "";
  const midia = m.midia !== "nenhuma" ? rotuloDaMidia(m) : "";
  const corpo = [midia, m.texto].filter(Boolean).join(" . ");
  return m.minha ? `${W.voce}: ${corpo}` : corpo;
}

function Conversa({ conversa, aoVoltar, aoAtualizar }: { conversa: ConversaWhatsapp; aoVoltar: () => void; aoAtualizar: (c: ConversaWhatsapp) => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLInputElement>(null);

  const escolherArquivo = (f: File | undefined) => {
    if (!f) return;
    setErro("");
    if (f.size > 16 * 1024 * 1024) {
      setErro(W.erros.arquivo_grande_demais);
      return;
    }
    setArquivo(f);
  };

  const enviarArquivo = async () => {
    if (!arquivo || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const atualizada = await whatsappPonte.enviarArquivo(conversa.id, arquivo, texto.trim());
      if (atualizada) aoAtualizar(atualizada);
      setArquivo(null);
      setTexto("");
      void tocarSom("send", "interface");
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
      void tocarSom("error", "avisos");
    } finally {
      setEnviando(false);
    }
  };

  const ultimaMensagem = conversa.mensagens[conversa.mensagens.length - 1]?.id;
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ultimaMensagem]);

  const enviar = async () => {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const atualizada = await whatsappPonte.enviar(conversa.id, limpo);
      if (atualizada) aoAtualizar(atualizada);
      setTexto("");
      void tocarSom("send", "interface");
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
      void tocarSom("error", "avisos");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="ilha-chat whatsapp-conversa">
      <div className="linha-entre whatsapp-topo">
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={W.voltar} title={W.voltar} onClick={aoVoltar}><ArrowLeft size={14} /></button>
        <Avatar nome={conversa.nome} foto={conversa.foto} tamanho={24} />
        <span className="ilha-titulo cortar privado" style={{ flex: 1 }}>{conversa.nome}</span>
        <button
          type="button"
          className="ilha-botao ilha-botao-icone"
          aria-label={W.ignorar}
          title={W.ignorar}
          onClick={() => {
            void whatsappPonte.ignorar(conversa.id, true).then((e) => useWhatsapp.getState().definir(e));
            aoVoltar();
          }}
        >
          <EyeOff size={14} />
        </button>
      </div>
      <div ref={lista} className="ilha-chat-lista whatsapp-mensagens">
        {conversa.mensagens.map((m) => (
          <div key={m.id} className="whatsapp-mensagem" data-minha={m.minha ? "sim" : "nao"} data-mencao={m.mencionaMe || undefined}>
            {conversa.grupo && !m.minha && m.nomeRemetente && <span className="whatsapp-remetente privado" style={{ color: corDoNome(m.nomeRemetente) }}>{m.nomeRemetente}</span>}
            {m.encaminhada && <span className="whatsapp-encaminhada"><Forward size={10} /> {W.encaminhada}</span>}
            {m.midia !== "nenhuma" && <MidiaDaMensagem jid={conversa.id} m={m} />}
            {m.texto && <span className="whatsapp-texto privado">{m.texto}</span>}
            <span className="whatsapp-hora">{horarioRelativo(m.data)}</span>
          </div>
        ))}
      </div>
      {erro && <span className="ilha-erro" role="status">{erro}</span>}
      {arquivo && (
        <div className="whatsapp-confirmar-arquivo" role="group">
          <span className="coluna" style={{ gap: 1, minWidth: 0, flex: 1 }}>
            <span className="cortar">{W.confirmarArquivo(arquivo.name, formatarTamanho(arquivo.size))}</span>
            <span className="ilha-mini">{W.legendaDoArquivo}</span>
          </span>
          <button type="button" className="ilha-pilula" disabled={enviando} onClick={() => setArquivo(null)}>{W.cancelarArquivo}</button>
          <button type="button" className="ilha-pilula" data-forte disabled={enviando} onClick={() => void enviarArquivo()}>{W.enviarArquivo}</button>
        </div>
      )}
      <div className="ilha-chat-entrada">
        <input ref={seletor} type="file" hidden onChange={(e) => { escolherArquivo(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={W.anexar} title={W.anexar} disabled={enviando} onClick={() => seletor.current?.click()}><Paperclip size={13} /></button>
        <div className="ilha-campo" style={{ flex: 1 }}>
          <textarea
            className="whatsapp-resposta"
            rows={Math.min(4, texto.split("\n").length)}
            value={texto}
            maxLength={4096}
            aria-label={W.responder}
            placeholder={W.responder}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void enviar();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                aoVoltar();
              }
            }}
          />
        </div>
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={W.enviar} title={W.enviar} disabled={!texto.trim() || enviando} onClick={() => void enviar()}><Send size={13} /></button>
      </div>
    </div>
  );
}

export function VisaoWhatsapp() {
  const estado = useWhatsapp((s) => s.estado);
  const carregar = useWhatsapp((s) => s.carregar);
  const irPara = useInterface((s) => s.irPara);
  const [aberta, setAberta] = useState<ConversaWhatsapp | null>(null);
  const abertaRef = useRef<string | null>(null);

  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), 3000);
    return () => {
      window.clearInterval(relogio);
      if (abertaRef.current) void whatsappPonte.fechar().catch(() => undefined);
    };
  }, [carregar]);

  useEffect(() => {
    if (!aberta) return;
    const atual = estado?.conversas.find((c) => c.id === aberta.id);
    const ultimaId = (c: ConversaWhatsapp) => c.mensagens[c.mensagens.length - 1]?.id;
    if (atual && (ultimaId(atual) !== ultimaId(aberta) || atual.mensagens.length !== aberta.mensagens.length || atual.foto !== aberta.foto)) setAberta(atual);
  }, [estado, aberta]);

  const abrir = async (c: ConversaWhatsapp) => {
    abertaRef.current = c.id;
    setAberta(c);
    const completa = await whatsappPonte.abrir(c.id).catch(() => null);
    if (completa && abertaRef.current === c.id) setAberta(completa);
    void carregar();
  };

  const voltar = () => {
    abertaRef.current = null;
    setAberta(null);
    void whatsappPonte.fechar().catch(() => undefined);
  };

  if (!estado?.ligado || estado.vinculo !== "conectado") {
    return (
      <div className="ilha-chat-vazio">
        <span className="ilha-sub">{estado?.ligado ? W.vinculos[estado.vinculo] : W.naoConectadoIlha}</span>
        <button type="button" className="ilha-pilula" onClick={() => irPara("conexoes", { servico: "whatsapp" })}><Settings2 size={12} /> {W.abrirConfiguracao}</button>
      </div>
    );
  }

  if (aberta) return <Conversa conversa={aberta} aoVoltar={voltar} aoAtualizar={setAberta} />;

  return (
    <div className="ilha-chat whatsapp-lista">
      {estado.conversas.length === 0 && <span className="ilha-sub">{W.semConversas}</span>}
      {estado.conversas.map((c) => {
        const ultima = c.mensagens[c.mensagens.length - 1];
        const mencao = c.grupo && c.mensagens.some((m) => m.mencionaMe && !m.minha);
        return (
          <button key={c.id} type="button" className="whatsapp-item" data-nao-lida={c.naoLidas > 0 || undefined} onClick={() => void abrir(c)}>
            <Avatar nome={c.nome} foto={c.foto} />
            <span className="whatsapp-item-textos">
              <span className="whatsapp-item-nome cortar privado">{c.nome}</span>
              <span className="whatsapp-item-previa cortar privado">{previa(ultima)}</span>
            </span>
            <span className="whatsapp-item-lado">
              <span className="ilha-mini numero">{horarioRelativo(c.ultimaAtividade)}</span>
              <span className="linha" style={{ gap: 4 }}>
                {mencao && <span className="whatsapp-mencao" title={W.mencao}><AtSign size={10} /></span>}
                {c.naoLidas > 0 && <span className="whatsapp-nao-lidas numero">{c.naoLidas}</span>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

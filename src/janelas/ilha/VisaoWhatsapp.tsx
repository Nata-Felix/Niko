import { useEffect, useRef, useState } from "react";
import { ArrowLeft, AtSign, EyeOff, Send, Settings2 } from "lucide-react";
import { T } from "../../textos/textos";
import { useWhatsapp } from "../../estado/whatsapp";
import { avisoLigado, useIlha } from "../../estado/ilha";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { tocarSom } from "../../ponte/sons";
import { corDoNome, iniciaisDoNome, whatsappPonte, type ConversaWhatsapp, type MensagemWhatsapp, type NovidadeWhatsapp } from "../../ponte/whatsapp";
import { horarioRelativo } from "../../utilitarios/datas";
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

function Avatar({ nome, tamanho = 30 }: { nome: string; tamanho?: number }) {
  return (
    <span className="whatsapp-avatar" style={{ width: tamanho, height: tamanho, background: corDoNome(nome) }} aria-hidden="true">
      {iniciaisDoNome(nome)}
    </span>
  );
}

function previa(m: MensagemWhatsapp | undefined): string {
  if (!m) return "";
  const midia = m.midia !== "nenhuma" ? `${W.midias[m.midia] ?? W.midias.outra}${m.nomeDoArquivo ? `: ${m.nomeDoArquivo}` : ""}` : "";
  const corpo = [midia, m.texto].filter(Boolean).join(" . ");
  return m.minha ? `${W.voce}: ${corpo}` : corpo;
}

function Conversa({ conversa, aoVoltar, aoAtualizar }: { conversa: ConversaWhatsapp; aoVoltar: () => void; aoAtualizar: (c: ConversaWhatsapp) => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [conversa.mensagens.length]);

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
    <div className="whatsapp-conversa">
      <div className="linha-entre whatsapp-topo">
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={W.voltar} title={W.voltar} onClick={aoVoltar}><ArrowLeft size={14} /></button>
        <Avatar nome={conversa.nome} tamanho={24} />
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
      <div className="ilha-chat-lista whatsapp-mensagens">
        {conversa.mensagens.map((m) => (
          <div key={m.id} className="whatsapp-mensagem" data-minha={m.minha ? "sim" : "nao"} data-mencao={m.mencionaMe || undefined}>
            {conversa.grupo && !m.minha && m.nomeRemetente && <span className="whatsapp-remetente privado" style={{ color: corDoNome(m.nomeRemetente) }}>{m.nomeRemetente}</span>}
            {m.midia !== "nenhuma" && <span className="whatsapp-midia">{W.midias[m.midia] ?? W.midias.outra}{m.nomeDoArquivo ? `: ${m.nomeDoArquivo}` : ""}</span>}
            {m.texto && <span className="whatsapp-texto privado">{m.texto}</span>}
            <span className="whatsapp-hora">{horarioRelativo(m.data)}</span>
          </div>
        ))}
        <div ref={fim} />
      </div>
      {erro && <span className="ilha-erro" role="status">{erro}</span>}
      <div className="ilha-chat-entrada">
        <div className="ilha-campo" style={{ flex: 1 }}>
          <input value={texto} maxLength={4096} aria-label={W.responder} placeholder={W.responder} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void enviar(); }} />
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
    if (atual && atual.mensagens.length !== aberta.mensagens.length) setAberta(atual);
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
    <div className="ilha-rolagem whatsapp-lista">
      {estado.conversas.length === 0 && <span className="ilha-sub">{W.semConversas}</span>}
      {estado.conversas.map((c) => {
        const ultima = c.mensagens[c.mensagens.length - 1];
        const mencao = c.grupo && c.mensagens.some((m) => m.mencionaMe && !m.minha);
        return (
          <button key={c.id} type="button" className="whatsapp-item" data-nao-lida={c.naoLidas > 0 || undefined} onClick={() => void abrir(c)}>
            <Avatar nome={c.nome} />
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

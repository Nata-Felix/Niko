import { connect, type TLSSocket } from "node:tls";

export type ValorImap = string | null | ValorImap[];

const TEMPO_DA_CONEXAO_MS = 20_000;

export function aspasImap(texto: string): string {
  return `"${texto.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function analisarLista(texto: string): ValorImap[] {
  let i = 0;
  const ler = (): ValorImap => {
    while (texto[i] === " ") i++;
    if (texto[i] === "(") {
      i++;
      const lista: ValorImap[] = [];
      while (i < texto.length && texto[i] !== ")") {
        lista.push(ler());
        while (texto[i] === " ") i++;
      }
      i++;
      return lista;
    }
    if (texto[i] === '"') {
      i++;
      let valor = "";
      while (i < texto.length && texto[i] !== '"') {
        if (texto[i] === "\\") i++;
        valor += texto[i++];
      }
      i++;
      return valor;
    }
    if (texto[i] === "\u0000") {
      const fim = texto.indexOf("\u0001", i);
      const valor = texto.slice(i + 1, fim);
      i = fim + 1;
      return valor;
    }
    let atomo = "";
    while (i < texto.length && !" ()".includes(texto[i])) atomo += texto[i++];
    return atomo.toUpperCase() === "NIL" ? null : atomo;
  };
  const resultado: ValorImap[] = [];
  while (i < texto.length) {
    resultado.push(ler());
    while (texto[i] === " ") i++;
  }
  return resultado;
}

function decodificarQ(texto: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "_") bytes.push(0x20);
    else if (c === "=" && /^[0-9a-f]{2}$/i.test(texto.slice(i + 1, i + 3))) {
      bytes.push(parseInt(texto.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(c.charCodeAt(0));
  }
  return Uint8Array.from(bytes);
}

export function decodificarCabecalho(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=(\s+(?==\?))?/g, (_t, charset: string, modo: string, conteudo: string) => {
    try {
      const bytes = modo.toUpperCase() === "B" ? Uint8Array.from(Buffer.from(conteudo, "base64")) : decodificarQ(conteudo);
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return conteudo;
    }
  });
}

export interface CabecalhoDeEmail {
  uid: number;
  lido: boolean;
  data: string;
  assunto: string;
  de: string;
  endereco: string;
}

function endereco(lista: ValorImap): { nome: string; email: string } {
  const primeiro = Array.isArray(lista) && Array.isArray(lista[0]) ? (lista[0] as ValorImap[]) : null;
  if (!primeiro) return { nome: "", email: "" };
  const [nome, , caixa, dominio] = primeiro as (string | null)[];
  const email = caixa && dominio ? `${caixa}@${dominio}` : "";
  return { nome: decodificarCabecalho(nome) || email.split("@")[0], email };
}

export function cabecalhoDaResposta(linha: string): CabecalhoDeEmail | null {
  const inicio = linha.indexOf("(");
  if (inicio < 0) return null;
  const [lista] = analisarLista(linha.slice(inicio));
  if (!Array.isArray(lista)) return null;
  const campos = new Map<string, ValorImap>();
  for (let i = 0; i + 1 < lista.length; i += 2) if (typeof lista[i] === "string") campos.set((lista[i] as string).toUpperCase(), lista[i + 1]);
  const envelope = campos.get("ENVELOPE");
  if (!Array.isArray(envelope)) return null;
  const flags = campos.get("FLAGS");
  const remetente = endereco(envelope[2]);
  const data = new Date(String(campos.get("INTERNALDATE") ?? envelope[0] ?? ""));
  return {
    uid: Number(campos.get("UID")) || 0,
    lido: Array.isArray(flags) && flags.some((f) => typeof f === "string" && f.toLowerCase() === "\\seen"),
    data: Number.isNaN(data.getTime()) ? new Date().toISOString() : data.toISOString(),
    assunto: decodificarCabecalho(envelope[1] as string | null).slice(0, 200),
    de: remetente.nome.slice(0, 120),
    endereco: remetente.email.slice(0, 160),
  };
}

class SessaoImap {
  private buffer = "";
  private bytesPendentes = 0;
  private linhaAtual = "";
  private linhas: string[] = [];
  private espera: { resolver: () => void; rejeitar: (e: Error) => void } | null = null;
  private fechada: Error | null = null;
  private contador = 0;
  private socket: TLSSocket;

  constructor(socket: TLSSocket) {
    this.socket = socket;
    socket.setEncoding("latin1");
    socket.on("data", (d: string) => this.receber(d));
    socket.on("error", (e: Error) => this.encerrar(e));
    socket.on("close", () => this.encerrar(new Error("imap_conexao_fechada")));
  }

  private encerrar(e: Error) {
    this.fechada ??= e;
    const espera = this.espera;
    this.espera = null;
    espera?.rejeitar(this.fechada);
  }

  private receber(dados: string) {
    this.buffer += dados;
    while (this.buffer) {
      if (this.bytesPendentes > 0) {
        const parte = this.buffer.slice(0, this.bytesPendentes);
        this.linhaAtual += parte.replace(/[\u0000\u0001]/g, "");
        this.bytesPendentes -= parte.length;
        this.buffer = this.buffer.slice(parte.length);
        if (this.bytesPendentes === 0) this.linhaAtual += "\u0001";
        continue;
      }
      const fim = this.buffer.indexOf("\r\n");
      if (fim < 0) return;
      const linha = this.buffer.slice(0, fim);
      this.buffer = this.buffer.slice(fim + 2);
      const literal = /\{(\d+)\}$/.exec(linha);
      if (literal) {
        this.linhaAtual += `${linha.slice(0, literal.index)}\u0000`;
        this.bytesPendentes = Number(literal[1]);
        continue;
      }
      const completa = this.linhaAtual + linha;
      this.linhaAtual = "";
      this.linhas.push(Buffer.from(completa, "latin1").toString("utf8"));
      const espera = this.espera;
      this.espera = null;
      espera?.resolver();
    }
  }

  private proximaLinha(): Promise<string> {
    return new Promise((resolver, rejeitar) => {
      if (this.linhas.length) return resolver(this.linhas.shift()!);
      if (this.fechada) return rejeitar(this.fechada);
      this.espera = { resolver: () => resolver(this.linhas.shift()!), rejeitar };
    });
  }

  async saudacao() {
    const linha = await this.proximaLinha();
    if (!/^\* (OK|PREAUTH)/i.test(linha)) throw new Error("imap_recusou");
  }

  async comando(texto: string): Promise<string[]> {
    const tag = `N${++this.contador}`;
    this.socket.write(`${tag} ${texto}\r\n`);
    const respostas: string[] = [];
    for (;;) {
      const linha = await this.proximaLinha();
      if (linha.startsWith(`${tag} `)) {
        if (!/^\S+ OK/i.test(linha)) throw new Error(/AUTHENTICATIONFAILED|LOGIN|invalid credentials|authenticat/i.test(linha) ? "imap_senha_invalida" : `imap_${linha.slice(tag.length + 1, tag.length + 60)}`);
        return respostas;
      }
      respostas.push(linha);
    }
  }
}

export interface ConfigImap {
  servidor: string;
  porta: number;
  usuario: string;
  senha: string;
}

export interface CaixaDeEntrada {
  naoLidas: number;
  total: number;
  mensagens: CabecalhoDeEmail[];
}

export async function lerCaixaDeEntrada(c: ConfigImap, quantas = 15): Promise<CaixaDeEntrada> {
  const socket = connect({ host: c.servidor, port: c.porta, servername: c.servidor, timeout: TEMPO_DA_CONEXAO_MS });
  const limite = setTimeout(() => socket.destroy(new Error("imap_tempo_esgotado")), TEMPO_DA_CONEXAO_MS);
  try {
    await new Promise<void>((resolver, rejeitar) => {
      socket.once("secureConnect", () => resolver());
      socket.once("error", rejeitar);
    });
    const sessao = new SessaoImap(socket);
    await sessao.saudacao();
    await sessao.comando(`LOGIN ${aspasImap(c.usuario)} ${aspasImap(c.senha)}`);
    const examinar = await sessao.comando("EXAMINE INBOX");
    const total = Number(examinar.map((l) => /^\* (\d+) EXISTS/i.exec(l)?.[1]).find(Boolean) ?? 0);
    const busca = await sessao.comando("SEARCH UNSEEN");
    const naoLidas = (busca.find((l) => /^\* SEARCH/i.test(l)) ?? "").replace(/^\* SEARCH/i, "").trim().split(/\s+/).filter(Boolean).length;
    let mensagens: CabecalhoDeEmail[] = [];
    if (total > 0) {
      const inicio = Math.max(1, total - quantas + 1);
      const linhas = await sessao.comando(`FETCH ${inicio}:${total} (UID FLAGS INTERNALDATE ENVELOPE)`);
      mensagens = linhas.filter((l) => /^\* \d+ FETCH/i.test(l)).map(cabecalhoDaResposta).filter((m): m is CabecalhoDeEmail => m !== null).sort((a, b) => b.data.localeCompare(a.data));
    }
    await sessao.comando("LOGOUT").catch(() => []);
    return { naoLidas, total, mensagens };
  } finally {
    clearTimeout(limite);
    socket.destroy();
  }
}

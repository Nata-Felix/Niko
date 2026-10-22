import { request as pedirHttp, type IncomingMessage } from "node:http";
import { request as pedirHttps } from "node:https";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

// Pesquisa e leitura de páginas para os agentes. O endereço vem da IA, que pode ser induzida por uma página
// a pedir algo interno (a própria ponte, o roteador, a rede local): todo IP resolvido é conferido na conexão,
// inclusive após redirecionamentos, e só endereços públicos passam.

const TEMPO_LIMITE_MS = 12_000;
const BYTES_MAXIMOS = 2_000_000;
const REDIRECIONAMENTOS_MAXIMOS = 4;
const TEXTO_MAXIMO = 12_000;
const RESULTADOS_MAXIMOS = 8;
const AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Niko";

export interface ResultadoDaBusca {
  titulo: string;
  url: string;
  trecho: string;
}

function ipv4Privado(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}

export function ipPrivado(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Privado(ip);
  const v6 = ip.toLowerCase();
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapeado) return ipv4Privado(mapeado[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

const buscaPublica: LookupFunction = (host, opcoes, retorno) => {
  lookup(host, { ...opcoes, all: true }, (erro, enderecos) => {
    if (erro) return retorno(erro, "", 0);
    const lista = Array.isArray(enderecos) ? enderecos : [];
    const publico = lista.find((e) => !ipPrivado(e.address));
    if (!publico || lista.some((e) => ipPrivado(e.address))) return retorno(new Error("endereco_bloqueado"), "", 0);
    if (opcoes.all) return (retorno as unknown as (e: null, l: typeof lista) => void)(null, lista);
    retorno(null, publico.address, publico.family);
  });
};

export function urlPublica(texto: string): URL {
  const url = new URL(texto);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocolo_nao_permitido");
  if (url.username || url.password) throw new Error("url_invalida");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && ipPrivado(host)) throw new Error("endereco_bloqueado");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("endereco_bloqueado");
  return url;
}

interface Resposta {
  url: URL;
  tipo: string;
  corpo: string;
}

function charsetDe(tipo: string): string {
  const m = /charset=([\w-]+)/i.exec(tipo);
  try {
    return new TextDecoder(m?.[1] ?? "utf-8").encoding;
  } catch {
    return "utf-8";
  }
}

function baixarUmaVez(url: URL, formulario?: string): Promise<{ status: number; local?: string; tipo: string; corpo: Buffer }> {
  return new Promise((resolver, rejeitar) => {
    const pedir = url.protocol === "https:" ? pedirHttps : pedirHttp;
    const cabecalhos: Record<string, string> = { "user-agent": AGENTE, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5", "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" };
    if (formulario !== undefined) cabecalhos["content-type"] = "application/x-www-form-urlencoded";
    const req = pedir(url, { method: formulario === undefined ? "GET" : "POST", lookup: buscaPublica, headers: cabecalhos, timeout: TEMPO_LIMITE_MS }, (res: IncomingMessage) => {
      const partes: Buffer[] = [];
      let total = 0;
      res.on("data", (parte: Buffer) => {
        total += parte.length;
        if (total > BYTES_MAXIMOS) {
          req.destroy();
          resolver({ status: res.statusCode ?? 0, local: res.headers.location, tipo: String(res.headers["content-type"] ?? ""), corpo: Buffer.concat(partes) });
          return;
        }
        partes.push(parte);
      });
      res.on("end", () => resolver({ status: res.statusCode ?? 0, local: res.headers.location, tipo: String(res.headers["content-type"] ?? ""), corpo: Buffer.concat(partes) }));
      res.on("error", rejeitar);
    });
    req.on("timeout", () => req.destroy(new Error("tempo_esgotado")));
    req.on("error", rejeitar);
    req.end(formulario);
  });
}

async function baixar(endereco: string, formulario?: string): Promise<Resposta> {
  let url = urlPublica(endereco);
  for (let i = 0; i <= REDIRECIONAMENTOS_MAXIMOS; i++) {
    // Redirecionamento de um formulário vira GET, como no navegador.
    const r = await baixarUmaVez(url, i === 0 ? formulario : undefined);
    if (r.status >= 300 && r.status < 400 && r.local) {
      url = urlPublica(new URL(r.local, url).toString());
      continue;
    }
    if (r.status < 200 || r.status >= 300) throw new Error(`http_${r.status}`);
    return { url, tipo: r.tipo, corpo: new TextDecoder(charsetDe(r.tipo)).decode(r.corpo) };
  }
  throw new Error("redirecionamentos_demais");
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, nome: string) => {
    if (nome[0] === "#") {
      const codigo = nome[1].toLowerCase() === "x" ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      return Number.isFinite(codigo) && codigo > 0 && codigo < 0x110000 ? String.fromCodePoint(codigo) : "";
    }
    return ENTIDADES[nome.toLowerCase()] ?? todo;
  });
}

export function textoDoHtml(html: string): { titulo: string; texto: string } {
  const titulo = decodificarEntidades(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const corpo = html
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const texto = decodificarEntidades(corpo).replace(/[ \t\f\r]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return { titulo, texto };
}

export async function lerPagina(endereco: string): Promise<{ url: string; titulo: string; texto: string; cortado: boolean }> {
  const r = await baixar(endereco);
  const html = /html|xml/i.test(r.tipo) || !r.tipo;
  if (!html && !/^text\//i.test(r.tipo)) throw new Error("tipo_nao_suportado");
  const { titulo, texto } = html ? textoDoHtml(r.corpo) : { titulo: "", texto: r.corpo.trim() };
  return { url: r.url.toString(), titulo, texto: texto.slice(0, TEXTO_MAXIMO), cortado: texto.length > TEXTO_MAXIMO };
}

export function resultadosDoDuckDuckGo(html: string): ResultadoDaBusca[] {
  const resultados: ResultadoDaBusca[] = [];
  const blocos = html.split(/class="result__body"|class="links_main/).slice(1);
  for (const bloco of blocos) {
    const link = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(bloco);
    if (!link) continue;
    let url = decodificarEntidades(link[1]);
    const destino = /[?&]uddg=([^&]+)/.exec(url);
    if (destino) url = decodeURIComponent(destino[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    const trecho = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(bloco)?.[1] ?? "";
    const limpar = (t: string) => decodificarEntidades(t.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    resultados.push({ titulo: limpar(link[2]), url, trecho: limpar(trecho) });
    if (resultados.length >= RESULTADOS_MAXIMOS) break;
  }
  return resultados;
}

// O Bing esconde o destino em u=a1<base64url> dos links de clique.
function destinoDoBing(href: string): string {
  const u = /[?&]u=a1([^&]+)/.exec(href)?.[1];
  if (!u) return href;
  try {
    return Buffer.from(u.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return href;
  }
}

export function resultadosDoBing(html: string): ResultadoDaBusca[] {
  const resultados: ResultadoDaBusca[] = [];
  const limpar = (t: string) => decodificarEntidades(t.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  for (const bloco of html.split(/<li class="b_algo"/).slice(1)) {
    const link = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(bloco);
    if (!link) continue;
    const url = destinoDoBing(decodificarEntidades(link[1]));
    if (!/^https?:\/\//.test(url)) continue;
    const trecho = /<p[^>]*>([\s\S]*?)<\/p>/.exec(bloco)?.[1] ?? "";
    resultados.push({ titulo: limpar(link[2]), url, trecho: limpar(trecho) });
    if (resultados.length >= RESULTADOS_MAXIMOS) break;
  }
  return resultados;
}

// DuckDuckGo por formulário (como o navegador faz; o GET cai no anti-robô) e Bing como reserva.
export async function buscarNaWeb(consulta: string): Promise<{ resultados: ResultadoDaBusca[]; fonte: string }> {
  const termo = consulta.trim().slice(0, 300);
  if (!termo) throw new Error("consulta_vazia");
  const tentativas: [string, () => Promise<ResultadoDaBusca[]>][] = [
    ["duckduckgo", async () => resultadosDoDuckDuckGo((await baixar("https://html.duckduckgo.com/html/", `q=${encodeURIComponent(termo)}&kl=br-pt`)).corpo)],
    ["bing", async () => resultadosDoBing((await baixar(`https://www.bing.com/search?q=${encodeURIComponent(termo)}&setlang=pt-BR`)).corpo)],
  ];
  for (const [fonte, buscar] of tentativas) {
    const resultados = await buscar().catch(() => []);
    if (resultados.length > 0) return { resultados, fonte };
  }
  throw new Error("busca_indisponivel");
}

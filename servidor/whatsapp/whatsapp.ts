import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pastaDados } from "../ia.ts";
import { lerSegredo, gravarSegredo, apagarSegredo } from "../segredos.ts";
import { porta as portaDaPonte } from "../claude.ts";
import {
  CaixaWhatsapp, LimiteDeEnvios, caminhoDoQr, conversasDoGateway, dispositivoDoGateway, ehGrupo, jidNormalizado, mensagemDoWebhook,
  mensagensDoGateway, numeroParaExibir, recusaDaResposta, webhookAutentico, type ConversaWhatsapp, type FiltrosWhatsapp, type MensagemWhatsapp, type SituacaoDoVinculo,
} from "./caixa.ts";
import { aguardarGowaParar, alvoDaPlataforma, gowaInstalado, gowaRodando, iniciarGowa, instalacao, instalarGowa, pararGowa, portaLivre } from "./gowa.ts";

export const CAMINHO_DO_WEBHOOK = "/ponte/whatsapp/webhook";
const DISPOSITIVO = "niko";
const TICK_MS = 5000;
const SILENCIO_DO_WEBHOOK_MS = 90_000;
const HISTORICO_MS = 6 * 3600_000;
const MAXIMO_DE_NOVIDADES = 50;

interface ConfigWhatsapp extends FiltrosWhatsapp {
  ligado: boolean;
  lerAoAbrir: boolean;
}

const PADRAO: ConfigWhatsapp = { ligado: false, silenciarGrupos: true, ignoradas: [], lerAoAbrir: true };
const arquivoDeConfig = () => join(pastaDados(), "whatsapp.json");

function lerConfig(): ConfigWhatsapp {
  try {
    if (!existsSync(arquivoDeConfig())) return { ...PADRAO };
    const lido = JSON.parse(readFileSync(arquivoDeConfig(), "utf8")) as Partial<ConfigWhatsapp>;
    return {
      ligado: lido.ligado === true,
      silenciarGrupos: lido.silenciarGrupos !== false,
      ignoradas: Array.isArray(lido.ignoradas) ? lido.ignoradas.filter((j): j is string => typeof j === "string").slice(0, 500) : [],
      lerAoAbrir: lido.lerAoAbrir !== false,
    };
  } catch {
    return { ...PADRAO };
  }
}

function salvarConfig(c: ConfigWhatsapp) {
  mkdirSync(pastaDados(), { recursive: true });
  const temporario = `${arquivoDeConfig()}.${process.pid}.tmp`;
  writeFileSync(temporario, JSON.stringify(c, null, 2), "utf8");
  renameSync(temporario, arquivoDeConfig());
}

async function segredoGuardado(id: string, criar: () => string): Promise<string> {
  const atual = await lerSegredo(id);
  if (atual) return atual;
  const novo = criar();
  await gravarSegredo(id, novo);
  return novo;
}

const estado = {
  config: lerConfig(),
  porta: 0,
  dispositivo: DISPOSITIVO,
  acesso: "",
  segredo: "",
  vinculo: "desligado" as SituacaoDoVinculo | "desligado" | "sem_gateway" | "iniciando",
  eu: null as string | null,
  qr: null as { png: string; expira: number } | null,
  erro: "",
  falhasSeguidas: 0,
  historicoCarregado: false,
  ultimoWebhook: 0,
  ultimaVarredura: 0,
  conversaAberta: null as string | null,
  nomesPedidos: new Set<string>(),
  novidades: [] as { seq: number; jid: string; nome: string; grupo: boolean }[],
  seq: 0,
};
const caixa = new CaixaWhatsapp();
const envios = new LimiteDeEnvios();
let relogio: ReturnType<typeof setInterval> | null = null;
let ocupado = false;

async function chamar(metodo: string, caminho: string, opcoes: { query?: Record<string, string>; json?: unknown; tempoMs?: number; binario?: boolean } = {}): Promise<{ status: number; corpo: unknown; bytes?: Buffer }> {
  if (!estado.porta) throw new Error("gateway_parado");
  const url = new URL(`http://127.0.0.1:${estado.porta}${caminho}`);
  for (const [k, v] of Object.entries(opcoes.query ?? {})) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method: metodo,
    redirect: "manual",
    headers: {
      authorization: `Basic ${Buffer.from(estado.acesso).toString("base64")}`,
      "x-device-id": estado.dispositivo,
      accept: opcoes.binario ? "image/png" : "application/json",
      ...(opcoes.json === undefined ? {} : { "content-type": "application/json" }),
    },
    body: opcoes.json === undefined ? undefined : JSON.stringify(opcoes.json),
    signal: AbortSignal.timeout(opcoes.tempoMs ?? 10_000),
  });
  if (opcoes.binario) return { status: r.status, corpo: null, bytes: Buffer.from(await r.arrayBuffer()) };
  const corpo = await r.json().catch(() => null);
  return { status: r.status, corpo };
}

function codigoDeErro(corpo: unknown) {
  const c = (corpo as Record<string, unknown> | null)?.code;
  return typeof c === "string" ? c : "";
}

async function chamarComSucesso(metodo: string, caminho: string, opcoes: Parameters<typeof chamar>[2] = {}) {
  const r = await chamar(metodo, caminho, opcoes);
  if (r.status === 401) throw new Error("gateway_recusou_acesso");
  if (r.status < 200 || r.status >= 300) throw new Error(codigoDeErro(r.corpo) || `gateway_${r.status}`);
  return r.corpo;
}

function anunciar(m: MensagemWhatsapp) {
  const id = jidNormalizado(m.conversa);
  const conversa = caixa.conversas.get(id);
  if (!conversa) return;
  estado.seq += 1;
  estado.novidades = [...estado.novidades.filter((n) => n.jid !== id), { seq: estado.seq, jid: id, nome: conversa.nome, grupo: conversa.grupo }].slice(-MAXIMO_DE_NOVIDADES);
}

function guardar(mensagens: MensagemWhatsapp[], avisar: boolean) {
  for (const m of mensagens) {
    const id = jidNormalizado(m.conversa);
    const resultado = caixa.adicionar(m, estado.config, !avisar);
    if (resultado === "repetida" || resultado === "ignorada") continue;
    if (estado.conversaAberta === id && !m.minha) {
      caixa.marcarLida(id);
      continue;
    }
    if (resultado === "avisar") anunciar(m);
    if (ehGrupo(id) && caixa.conversas.get(id)?.nome === numeroParaExibir(id) && !estado.nomesPedidos.has(id)) void nomearGrupo(id);
  }
}

async function nomearGrupo(jid: string) {
  estado.nomesPedidos.add(jid);
  try {
    const corpo = await chamarComSucesso("GET", "/group/info", { query: { group_id: jid } });
    const r = (corpo as Record<string, unknown> | null)?.results as Record<string, unknown> | undefined;
    const nome = typeof r?.Name === "string" ? r.Name : typeof r?.name === "string" ? r.name : "";
    if (nome) caixa.renomear(jid, nome);
  } catch {
    return;
  }
}

async function carregarHistorico() {
  const conversas = conversasDoGateway(await chamarComSucesso("GET", "/chats", { query: { limit: "20" } }));
  const desde = new Date(Date.now() - HISTORICO_MS).toISOString();
  for (const c of conversas.filter((x) => x.ultima > desde).slice(0, 8)) {
    const mensagens = mensagensDoGateway(await chamarComSucesso("GET", `/chat/${encodeURIComponent(c.jid)}/messages`, { query: { limit: "10" } }), estado.eu);
    for (const m of mensagens) caixa.adicionar(m, estado.config, true, ehGrupo(c.jid) ? c.nome || undefined : undefined);
  }
  caixa.marcarTodasLidas();
  estado.historicoCarregado = true;
  estado.ultimaVarredura = Date.now();
}

async function varrerSemWebhook() {
  const desde = new Date(estado.ultimaVarredura - 5000).toISOString();
  estado.ultimaVarredura = Date.now();
  const conversas = conversasDoGateway(await chamarComSucesso("GET", "/chats", { query: { limit: "20" } }));
  for (const c of conversas.filter((x) => x.ultima > desde).slice(0, 8)) {
    const mensagens = mensagensDoGateway(await chamarComSucesso("GET", `/chat/${encodeURIComponent(c.jid)}/messages`, { query: { limit: "10", start_time: desde } }), estado.eu);
    guardar(mensagens.sort((a, b) => a.data.localeCompare(b.data)), true);
  }
}

async function atualizarQr() {
  if (estado.qr && estado.qr.expira > Date.now()) return;
  const r = await chamar("GET", `/devices/${encodeURIComponent(estado.dispositivo)}/login`, { tempoMs: 45_000 });
  if (codigoDeErro(r.corpo) === "ALREADY_LOGGED_IN") return;
  if (r.status < 200 || r.status >= 300) throw new Error(codigoDeErro(r.corpo) || `gateway_${r.status}`);
  const qr = caminhoDoQr(r.corpo);
  if (!qr) return;
  const imagem = await chamar("GET", qr.caminho, { binario: true });
  if (imagem.status !== 200 || !imagem.bytes || imagem.bytes.subarray(0, 4).toString("hex") !== "89504e47") return;
  estado.qr = { png: `data:image/png;base64,${imagem.bytes.toString("base64")}`, expira: Date.now() + Math.max(20, qr.segundos * 2 - 5) * 1000 };
}

async function prepararGateway() {
  estado.acesso ||= await segredoGuardado("whatsapp-acesso", () => `niko:${randomBytes(18).toString("hex")}`);
  estado.segredo ||= await segredoGuardado("whatsapp-webhook", () => randomBytes(32).toString("hex"));
  if (!estado.porta || (!gowaRodando() && estado.falhasSeguidas > 2)) estado.porta = await portaLivre();
  iniciarGowa({ porta: estado.porta, acesso: estado.acesso, urlDoWebhook: `http://127.0.0.1:${portaDaPonte()}${CAMINHO_DO_WEBHOOK}`, segredoDoWebhook: estado.segredo });
}

async function passo() {
  if (ocupado || !estado.config.ligado) return;
  ocupado = true;
  try {
    if (!gowaInstalado()) {
      estado.vinculo = "sem_gateway";
      return;
    }
    await prepararGateway();
    let dispositivo = dispositivoDoGateway(await chamarComSucesso("GET", "/devices"));
    if (!dispositivo) {
      await chamarComSucesso("POST", "/devices", { json: { device_id: DISPOSITIVO } });
      dispositivo = { id: DISPOSITIVO, vinculo: "precisa_qr", eu: null };
    }
    estado.dispositivo = dispositivo.id;
    estado.vinculo = dispositivo.vinculo;
    estado.eu = dispositivo.eu;
    estado.falhasSeguidas = 0;
    estado.erro = "";
    if (dispositivo.vinculo === "precisa_qr") {
      estado.historicoCarregado = false;
      await atualizarQr();
      return;
    }
    estado.qr = null;
    if (dispositivo.vinculo !== "conectado") return;
    if (!estado.historicoCarregado) await carregarHistorico();
    else if (Date.now() - estado.ultimoWebhook > SILENCIO_DO_WEBHOOK_MS && Date.now() - estado.ultimaVarredura > 20_000) await varrerSemWebhook();
  } catch (e) {
    estado.falhasSeguidas += 1;
    const mensagem = (e as Error).message;
    estado.erro = /fetch failed|ECONNREFUSED|gateway_parado|aborted|timeout/i.test(mensagem) ? (estado.falhasSeguidas > 2 ? "gateway_fora" : "") : mensagem;
    if (estado.falhasSeguidas <= 2) estado.vinculo = "iniciando";
  } finally {
    ocupado = false;
  }
}

function iniciarRelogio() {
  if (relogio) return;
  relogio = setInterval(() => void passo(), TICK_MS);
  relogio.unref?.();
  void passo();
}

function pararTudo(esquecer: boolean) {
  if (relogio) clearInterval(relogio);
  relogio = null;
  pararGowa();
  estado.vinculo = "desligado";
  estado.qr = null;
  estado.porta = 0;
  estado.historicoCarregado = false;
  if (esquecer) {
    caixa.limpar();
    estado.novidades = [];
    estado.conversaAberta = null;
  }
}

export function iniciarWhatsapp() {
  if (estado.config.ligado) iniciarRelogio();
}

export function encerrarWhatsapp() {
  pararTudo(true);
}

function resumoDaConversa(c: ConversaWhatsapp) {
  return { ...c, mensagens: c.mensagens.slice(-20) };
}

export function estadoDoWhatsapp() {
  const filtros = estado.config;
  return {
    suportado: alvoDaPlataforma() !== null,
    ligado: estado.config.ligado,
    instalado: gowaInstalado(),
    instalacao: { ...instalacao },
    rodando: gowaRodando(),
    vinculo: estado.config.ligado ? estado.vinculo : "desligado",
    eu: estado.eu,
    qr: estado.vinculo === "precisa_qr" ? estado.qr?.png ?? null : null,
    erro: estado.erro,
    filtros: { silenciarGrupos: filtros.silenciarGrupos, lerAoAbrir: filtros.lerAoAbrir, ignoradas: filtros.ignoradas },
    conversas: caixa.visiveis(filtros).slice(0, 30).map(resumoDaConversa),
    naoLidas: caixa.naoLidasVisiveis(filtros),
    seq: estado.seq,
  };
}

export function novidadesDoWhatsapp(desde: number) {
  return { seq: estado.seq, itens: estado.novidades.filter((n) => n.seq > desde) };
}

export async function instalarWhatsapp() {
  const versao = await instalarGowa(async () => {
    pararGowa();
    await aguardarGowaParar();
  });
  estado.porta = 0;
  if (estado.config.ligado) iniciarRelogio();
  return { ok: true, versao };
}

export function ligarWhatsapp(ligado: boolean) {
  estado.config = { ...estado.config, ligado };
  salvarConfig(estado.config);
  if (ligado) iniciarRelogio();
  else pararTudo(true);
  return estadoDoWhatsapp();
}

export function definirFiltrosDoWhatsapp(dados: Record<string, unknown>) {
  estado.config = {
    ...estado.config,
    ...(typeof dados.silenciarGrupos === "boolean" ? { silenciarGrupos: dados.silenciarGrupos } : {}),
    ...(typeof dados.lerAoAbrir === "boolean" ? { lerAoAbrir: dados.lerAoAbrir } : {}),
  };
  salvarConfig(estado.config);
  return estadoDoWhatsapp();
}

export function ignorarConversa(jid: unknown, ignorar: unknown) {
  if (typeof jid !== "string" || !jid.includes("@") || jid.length > 120) throw new Error("conversa_invalida");
  const id = jidNormalizado(jid);
  const ignoradas = new Set(estado.config.ignoradas);
  if (ignorar === false) ignoradas.delete(id);
  else {
    ignoradas.add(id);
    caixa.remover(id);
    estado.novidades = estado.novidades.filter((n) => n.jid !== id);
  }
  estado.config = { ...estado.config, ignoradas: [...ignoradas] };
  salvarConfig(estado.config);
  return estadoDoWhatsapp();
}

async function confirmarLeitura(jid: string) {
  const conversa = caixa.conversas.get(jid);
  const ultimaRecebida = [...(conversa?.mensagens ?? [])].reverse().find((m) => !m.minha);
  if (!ultimaRecebida) return;
  await chamarComSucesso("POST", `/message/${encodeURIComponent(ultimaRecebida.id)}/read`, { json: { phone: jid } }).catch(() => undefined);
}

export async function abrirConversa(jid: unknown) {
  if (typeof jid !== "string" || !caixa.conversas.has(jidNormalizado(jid))) throw new Error("conversa_invalida");
  const id = jidNormalizado(jid);
  estado.conversaAberta = id;
  const tinhaNaoLidas = (caixa.conversas.get(id)?.naoLidas ?? 0) > 0;
  const recentes = await chamarComSucesso("GET", `/chat/${encodeURIComponent(id)}/messages`, { query: { limit: "20" } }).catch(() => null);
  for (const m of mensagensDoGateway(recentes, estado.eu)) caixa.adicionar(m, estado.config, true);
  caixa.marcarLida(id);
  estado.novidades = estado.novidades.filter((n) => n.jid !== id);
  if (estado.config.lerAoAbrir && tinhaNaoLidas) await confirmarLeitura(id);
  const conversa = caixa.conversas.get(id);
  return conversa ? resumoDaConversa(conversa) : null;
}

export function fecharConversa() {
  estado.conversaAberta = null;
  return { ok: true };
}

export async function enviarMensagem(jid: unknown, texto: unknown) {
  if (typeof jid !== "string" || typeof texto !== "string") throw new Error("pedido_invalido");
  const id = jidNormalizado(jid);
  const recusa = recusaDaResposta(texto, id, caixa);
  if (recusa) throw new Error(`resposta_${recusa}`);
  if (!envios.permitir()) throw new Error("resposta_muitas");
  const corpo = await chamarComSucesso("POST", "/send/message", { json: { phone: id, message: texto.trim() } });
  const idDaMensagem = ((corpo as Record<string, unknown> | null)?.results as Record<string, unknown> | undefined)?.message_id;
  caixa.adicionar({ id: typeof idDaMensagem === "string" ? idDaMensagem : `niko-${randomBytes(6).toString("hex")}`, conversa: id, remetente: estado.eu ?? id, nomeRemetente: "", texto: texto.trim(), midia: "nenhuma", data: new Date().toISOString(), minha: true, mencionaMe: false }, estado.config);
  await confirmarLeitura(id);
  const conversa = caixa.conversas.get(id);
  return conversa ? resumoDaConversa(conversa) : null;
}

export async function desconectarWhatsapp() {
  await chamarComSucesso("POST", `/devices/${encodeURIComponent(estado.dispositivo)}/logout`).catch(() => undefined);
  caixa.limpar();
  estado.novidades = [];
  estado.historicoCarregado = false;
  estado.qr = null;
  estado.vinculo = "precisa_qr";
  return estadoDoWhatsapp();
}

export async function esquecerWhatsapp() {
  pararTudo(true);
  await apagarSegredo("whatsapp-acesso").catch(() => undefined);
  await apagarSegredo("whatsapp-webhook").catch(() => undefined);
  estado.acesso = "";
  estado.segredo = "";
  estado.config = { ...PADRAO };
  salvarConfig(estado.config);
  return estadoDoWhatsapp();
}

const LIMITE_DO_CORPO = 1_000_000;

export function receberWebhookDoWhatsapp(req: IncomingMessage, res: ServerResponse) {
  const partes: Buffer[] = [];
  let tamanho = 0;
  let recusado = false;
  req.on("data", (p: Buffer) => {
    tamanho += p.length;
    if (tamanho > LIMITE_DO_CORPO) {
      recusado = true;
      req.destroy();
      return;
    }
    partes.push(p);
  });
  req.on("end", () => {
    if (recusado) return;
    const corpo = Buffer.concat(partes);
    if (!estado.config.ligado || !webhookAutentico(corpo, req.headers["x-hub-signature-256"], estado.segredo)) {
      res.statusCode = 401;
      return res.end();
    }
    estado.ultimoWebhook = Date.now();
    res.statusCode = 200;
    res.end();
    let lido: unknown;
    try {
      lido = JSON.parse(corpo.toString("utf8"));
    } catch {
      return;
    }
    const mensagem = mensagemDoWebhook(lido, estado.eu);
    if (mensagem && estado.historicoCarregado) guardar([mensagem], true);
  });
}

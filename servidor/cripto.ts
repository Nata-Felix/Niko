import { createHash, createHmac } from "node:crypto";
import { lerJson } from "./conexoesExtras.ts";

export type Corretora = "binance" | "okx" | "bybit" | "kraken";
export type Rede = "bitcoin" | "ethereum" | "polygon" | "arbitrum" | "optimism" | "base" | "bnb" | "solana";

interface ConfigCripto {
  moedas: string[];
  moeda: string;
  fonte: "coinbase" | "okx";
  alerta: number;
  corretoras: { tipo: Corretora; chave: string; segredo: string; frase?: string }[];
  carteiras: { rede: Rede; endereco: string; nome?: string }[];
}

const MOEDAS_DE_EXIBICAO = new Set(["BRL", "USD", "EUR"]);
const TEMPO_MS = 15_000;

export function moedasDaLista(texto: unknown): string[] {
  const lista = Array.isArray(texto) ? texto : typeof texto === "string" ? texto.split(/[\s,;]+/) : [];
  return [...new Set(lista.map((m) => String(m).toUpperCase().replace(/[^A-Z0-9]/g, "")).filter((m) => m.length >= 2 && m.length <= 10))].slice(0, 12);
}

export function configDaCripto(chave: string): ConfigCripto {
  const c = lerJson<Record<string, unknown>>(chave);
  const moeda = String(c.moeda ?? "BRL").toUpperCase();
  return {
    moedas: moedasDaLista(c.moedas).length ? moedasDaLista(c.moedas) : ["BTC", "ETH"],
    moeda: MOEDAS_DE_EXIBICAO.has(moeda) ? moeda : "BRL",
    fonte: c.fonte === "okx" ? "okx" : "coinbase",
    alerta: [0, 3, 5, 10].includes(Number(c.alerta)) ? Number(c.alerta) : 0,
    corretoras: (Array.isArray(c.corretoras) ? c.corretoras : [])
      .filter((x): x is { tipo: Corretora; chave: string; segredo: string; frase?: string } => ["binance", "okx", "bybit", "kraken"].includes((x as { tipo?: string })?.tipo ?? "") && typeof (x as { chave?: unknown }).chave === "string" && typeof (x as { segredo?: unknown }).segredo === "string")
      .slice(0, 6),
    carteiras: (Array.isArray(c.carteiras) ? c.carteiras : [])
      .filter((x): x is { rede: Rede; endereco: string; nome?: string } => typeof (x as { endereco?: unknown })?.endereco === "string" && Object.hasOwn(REDES, (x as { rede?: string }).rede ?? ""))
      .slice(0, 12),
  };
}

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "user-agent": "Niko", accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TEMPO_MS) });
  if (!r.ok) throw new Error(`http_${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`);
  return (await r.json()) as T;
}

export async function taxasEmDolar(): Promise<Record<string, number>> {
  const r = await json<{ data?: { rates?: Record<string, string> } }>("https://api.coinbase.com/v2/exchange-rates?currency=USD");
  return Object.fromEntries(Object.entries(r.data?.rates ?? {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number) && (v as number) > 0));
}

export function precoEmDolar(ativo: string, taxas: Record<string, number>): number | null {
  if (["USD", "USDT", "USDC", "DAI", "BUSD", "FDUSD"].includes(ativo)) return 1;
  const taxa = taxas[ativo];
  return taxa ? 1 / taxa : null;
}

export interface Cotacao {
  simbolo: string;
  preco: number;
  variacao24h: number;
  curva: number[];
}

async function cotacaoCoinbase(simbolo: string): Promise<Cotacao> {
  const par = `${simbolo}-USD`;
  const [estatisticas, velas] = await Promise.all([
    json<{ open: string; last: string }>(`https://api.exchange.coinbase.com/products/${par}/stats`),
    json<number[][]>(`https://api.exchange.coinbase.com/products/${par}/candles?granularity=3600`).catch(() => []),
  ]);
  const preco = Number(estatisticas.last);
  const abertura = Number(estatisticas.open);
  return { simbolo, preco, variacao24h: abertura ? ((preco - abertura) / abertura) * 100 : 0, curva: velas.slice(0, 24).map((v) => Number(v[4])).reverse() };
}

async function cotacaoOkx(simbolo: string): Promise<Cotacao> {
  const par = `${simbolo}-USDT`;
  const [ticker, velas] = await Promise.all([
    json<{ data?: { last: string; open24h: string }[] }>(`https://www.okx.com/api/v5/market/ticker?instId=${par}`),
    json<{ data?: string[][] }>(`https://www.okx.com/api/v5/market/candles?instId=${par}&bar=1H&limit=24`).catch(() => ({ data: [] })),
  ]);
  const t = ticker.data?.[0];
  if (!t) throw new Error("par_desconhecido");
  const preco = Number(t.last);
  const abertura = Number(t.open24h);
  return { simbolo, preco, variacao24h: abertura ? ((preco - abertura) / abertura) * 100 : 0, curva: (velas.data ?? []).map((v) => Number(v[4])).reverse() };
}

const REDES: Record<Rede, { simbolo: string; rpc?: string[] }> = {
  bitcoin: { simbolo: "BTC" },
  ethereum: { simbolo: "ETH", rpc: ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"] },
  polygon: { simbolo: "POL", rpc: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"] },
  arbitrum: { simbolo: "ETH", rpc: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"] },
  optimism: { simbolo: "ETH", rpc: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io"] },
  base: { simbolo: "ETH", rpc: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"] },
  bnb: { simbolo: "BNB", rpc: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"] },
  solana: { simbolo: "SOL", rpc: ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"] },
};

export function enderecoValido(rede: Rede, endereco: string): boolean {
  if (rede === "bitcoin") return /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(endereco);
  if (rede === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(endereco);
  return /^0x[0-9a-fA-F]{40}$/.test(endereco);
}

async function rpc<T>(urls: string[], metodo: string, parametros: unknown[]): Promise<T> {
  let ultimo: Error = new Error("rpc_falhou");
  for (const url of urls) {
    try {
      const r = await json<{ result?: T; error?: { message: string } }>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params: parametros }) });
      if (r.error) throw new Error(r.error.message);
      return r.result as T;
    } catch (e) {
      ultimo = e as Error;
    }
  }
  throw ultimo;
}

async function saldoDaCarteira(rede: Rede, endereco: string): Promise<{ ativo: string; quantidade: number }> {
  if (!enderecoValido(rede, endereco)) throw new Error("endereco_invalido");
  const info = REDES[rede];
  if (rede === "bitcoin") {
    const r = await json<{ chain_stats: { funded_txo_sum: number; spent_txo_sum: number } }>(`https://mempool.space/api/address/${endereco}`);
    return { ativo: "BTC", quantidade: (r.chain_stats.funded_txo_sum - r.chain_stats.spent_txo_sum) / 1e8 };
  }
  if (rede === "solana") {
    const r = await rpc<{ value: number }>(info.rpc!, "getBalance", [endereco]);
    return { ativo: "SOL", quantidade: r.value / 1e9 };
  }
  const wei = await rpc<string>(info.rpc!, "eth_getBalance", [endereco, "latest"]);
  return { ativo: info.simbolo, quantidade: Number(BigInt(wei)) / 1e18 };
}

export function assinarBinance(consulta: string, segredo: string) {
  return createHmac("sha256", segredo).update(consulta).digest("hex");
}

export function assinarOkx(instante: string, metodo: string, caminho: string, corpo: string, segredo: string) {
  return createHmac("sha256", segredo).update(`${instante}${metodo}${caminho}${corpo}`).digest("base64");
}

export function assinarBybit(instante: string, chave: string, janela: string, consulta: string, segredo: string) {
  return createHmac("sha256", segredo).update(`${instante}${chave}${janela}${consulta}`).digest("hex");
}

export function assinarKraken(caminho: string, nonce: string, corpo: string, segredoBase64: string) {
  const resumo = createHash("sha256").update(nonce + corpo).digest();
  return createHmac("sha512", Buffer.from(segredoBase64, "base64")).update(Buffer.concat([Buffer.from(caminho), resumo])).digest("base64");
}

const NOMES_DO_KRAKEN: Record<string, string> = { XXBT: "BTC", XBT: "BTC", XETH: "ETH", XXRP: "XRP", XLTC: "LTC", XXLM: "XLM", XXDG: "DOGE", XDG: "DOGE", ZUSD: "USD", ZEUR: "EUR", ZGBP: "GBP" };

export function ativoDoKraken(nome: string): string {
  const base = nome.split(".")[0];
  return NOMES_DO_KRAKEN[base] ?? base;
}

async function saldosDaCorretora(c: ConfigCripto["corretoras"][number]): Promise<{ ativo: string; quantidade: number }[]> {
  if (c.tipo === "binance") {
    const consulta = new URLSearchParams({ omitZeroBalances: "true", recvWindow: "10000", timestamp: String(Date.now()) }).toString();
    const r = await json<{ balances: { asset: string; free: string; locked: string }[] }>(`https://api.binance.com/api/v3/account?${consulta}&signature=${assinarBinance(consulta, c.segredo)}`, { headers: { "X-MBX-APIKEY": c.chave } });
    return r.balances.map((b) => ({ ativo: b.asset, quantidade: Number(b.free) + Number(b.locked) }));
  }
  if (c.tipo === "okx") {
    const caminho = "/api/v5/account/balance";
    const instante = new Date().toISOString();
    const r = await json<{ data?: { details?: { ccy: string; eq: string }[] }[] }>(`https://www.okx.com${caminho}`, {
      headers: { "OK-ACCESS-KEY": c.chave, "OK-ACCESS-SIGN": assinarOkx(instante, "GET", caminho, "", c.segredo), "OK-ACCESS-TIMESTAMP": instante, "OK-ACCESS-PASSPHRASE": c.frase ?? "" },
    });
    return (r.data?.[0]?.details ?? []).map((d) => ({ ativo: d.ccy, quantidade: Number(d.eq) }));
  }
  if (c.tipo === "bybit") {
    const consulta = "accountType=UNIFIED";
    const instante = String(Date.now());
    const janela = "10000";
    const r = await json<{ retCode: number; retMsg: string; result?: { list?: { coin?: { coin: string; walletBalance: string }[] }[] } }>(`https://api.bybit.com/v5/account/wallet-balance?${consulta}`, {
      headers: { "X-BAPI-API-KEY": c.chave, "X-BAPI-TIMESTAMP": instante, "X-BAPI-RECV-WINDOW": janela, "X-BAPI-SIGN": assinarBybit(instante, c.chave, janela, consulta, c.segredo) },
    });
    if (r.retCode !== 0) throw new Error(`bybit_${r.retMsg}`);
    return (r.result?.list?.[0]?.coin ?? []).map((m) => ({ ativo: m.coin, quantidade: Number(m.walletBalance) }));
  }
  const caminho = "/0/private/Balance";
  const nonce = String(Date.now() * 1000);
  const corpo = new URLSearchParams({ nonce }).toString();
  const r = await json<{ error: string[]; result?: Record<string, string> }>(`https://api.kraken.com${caminho}`, {
    method: "POST",
    headers: { "API-Key": c.chave, "API-Sign": assinarKraken(caminho, nonce, corpo, c.segredo), "content-type": "application/x-www-form-urlencoded" },
    body: corpo,
  });
  if (r.error?.length) throw new Error(`kraken_${r.error[0]}`);
  return Object.entries(r.result ?? {}).map(([ativo, q]) => ({ ativo: ativoDoKraken(ativo), quantidade: Number(q) }));
}

export async function lerCripto(chave: string) {
  const c = configDaCripto(chave);
  const taxas = await taxasEmDolar();
  const paraExibir = c.moeda === "USD" ? 1 : taxas[c.moeda] ?? null;
  if (!paraExibir) throw new Error("sem_cotacao_da_moeda");
  const cotar = c.fonte === "okx" ? cotacaoOkx : cotacaoCoinbase;
  const resultados = await Promise.allSettled(c.moedas.map(cotar));
  const cotacoes = resultados.flatMap((r) => (r.status === "fulfilled" && Number.isFinite(r.value.preco) ? [{ ...r.value, preco: r.value.preco * paraExibir, curva: r.value.curva.map((v) => v * paraExibir) }] : []));
  const semCotacao = c.moedas.filter((_, i) => resultados[i].status === "rejected");

  const posicoes: { origem: string; ativo: string; quantidade: number; valor: number | null }[] = [];
  const falhas: string[] = [];
  await Promise.all([
    ...c.corretoras.map(async (x) => {
      try {
        for (const s of await saldosDaCorretora(x)) if (s.quantidade > 0) posicoes.push({ origem: x.tipo, ...s, valor: null });
      } catch (e) {
        falhas.push(`${x.tipo}: ${(e as Error).message.slice(0, 80)}`);
      }
    }),
    ...c.carteiras.map(async (w) => {
      try {
        const s = await saldoDaCarteira(w.rede, w.endereco);
        posicoes.push({ origem: w.nome || `${w.rede} ${w.endereco.slice(0, 6)}...${w.endereco.slice(-4)}`, ...s, valor: null });
      } catch (e) {
        falhas.push(`${w.rede}: ${(e as Error).message.slice(0, 80)}`);
      }
    }),
  ]);
  for (const p of posicoes) {
    const usd = precoEmDolar(p.ativo, taxas);
    p.valor = usd === null ? null : p.quantidade * usd * paraExibir;
  }
  posicoes.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  return {
    moeda: c.moeda,
    fonte: c.fonte,
    alerta: c.alerta,
    cotacoes,
    semCotacao,
    carteira: { total: posicoes.reduce((t, p) => t + (p.valor ?? 0), 0), posicoes: posicoes.slice(0, 60) },
    falhas,
  };
}

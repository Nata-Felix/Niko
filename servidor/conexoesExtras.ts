import { gravarSegredo } from "./segredos.ts";
import { receberCodigoNoNavegador } from "./oauthLocal.ts";
import { lerCaixaDeEntrada } from "./imap.ts";
import { eventosDoIcs, nomeDaAgenda, type EventoIcs } from "./ics.ts";
import { alcanceDoEndereco } from "../src/utilitarios/enderecoDoProvedor.ts";

type Pedir = <T>(url: string, cabecalhos: Record<string, string>, corpo?: unknown) => Promise<T>;

export function lerJson<T extends Record<string, unknown>>(texto: string): Partial<T> {
  try {
    const v = JSON.parse(texto) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}

const texto = (v: unknown, maximo = 300) => (typeof v === "string" ? v.trim().slice(0, maximo) : "");

export function urlPublicaSegura(bruta: string, hostsPermitidos?: (host: string) => boolean): URL {
  let url: URL;
  try {
    url = new URL(bruta.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new Error("url_invalida");
  }
  if (url.protocol !== "https:") throw new Error("url_precisa_https");
  if (alcanceDoEndereco(url.hostname) !== "internet") throw new Error("url_da_rede_local");
  if (hostsPermitidos && !hostsPermitidos(url.hostname.toLowerCase())) throw new Error("url_de_outro_servico");
  return url;
}

async function textoLimitado(url: string, cabecalhos: Record<string, string>, limite: number): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": "Niko", ...cabecalhos }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`http_${r.status}`);
  const corpo = Buffer.from(await r.arrayBuffer());
  if (corpo.length > limite) throw new Error("resposta_grande_demais");
  return corpo.toString("utf8");
}

async function graphql<T>(pedir: Pedir, url: string, cabecalhos: Record<string, string>, query: string, variaveis?: Record<string, unknown>): Promise<T> {
  const r = await pedir<{ data?: T; errors?: { message: string }[] }>(url, cabecalhos, { query, variables: variaveis ?? {} });
  if (r.errors?.length && !r.data) throw new Error(`graphql ${r.errors[0].message.slice(0, 120)}`);
  return r.data as T;
}

export async function lerLinear(chave: string, pedir: Pedir) {
  const dados = await graphql<{ viewer: { name: string; assignedIssues: { nodes: { identifier: string; title: string; url: string; priority: number; priorityLabel: string; dueDate: string | null; updatedAt: string; state: { name: string; type: string }; team: { key: string; name: string } | null }[] } } }>(
    pedir,
    "https://api.linear.app/graphql",
    { authorization: chave },
    `query { viewer { name assignedIssues(first: 40, orderBy: updatedAt, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { identifier title url priority priorityLabel dueDate updatedAt state { name type } team { key name } } } } }`,
  );
  return {
    usuario: dados.viewer.name,
    issues: dados.viewer.assignedIssues.nodes.map((i) => ({
      id: i.identifier, titulo: i.title, url: i.url, prioridade: i.priority, rotuloPrioridade: i.priorityLabel, prazo: i.dueDate, atualizada: i.updatedAt,
      estado: i.state.name, tipoEstado: i.state.type, time: i.team?.name ?? "",
    })),
  };
}

export async function lerRailway(chave: string, pedir: Pedir) {
  const h = { authorization: `Bearer ${chave}` };
  const url = "https://backboard.railway.com/graphql/v2";
  const projetos = await graphql<{ projects: { edges: { node: { id: string; name: string; updatedAt: string } }[] } }>(pedir, url, h, "query { projects { edges { node { id name updatedAt } } } }");
  const lista = projetos.projects.edges.map((e) => e.node).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  const deploys = await Promise.all(
    lista.map((p) =>
      graphql<{ deployments: { edges: { node: { id: string; status: string; createdAt: string; staticUrl: string | null; url: string | null } }[] } }>(
        pedir, url, h,
        "query deploys($input: DeploymentListInput!, $first: Int) { deployments(input: $input, first: $first) { edges { node { id status createdAt staticUrl url } } } }",
        { input: { projectId: p.id }, first: 5 },
      )
        .then((r) => r.deployments.edges.map((e) => ({ ...e.node, projeto: p.name })))
        .catch(() => []),
    ),
  );
  const estado = (s: string) => (s === "SUCCESS" ? "pronto" : s === "FAILED" || s === "CRASHED" ? "erro" : s === "BUILDING" || s === "DEPLOYING" || s === "INITIALIZING" || s === "QUEUED" || s === "WAITING" ? "construindo" : s === "SLEEPING" ? "dormindo" : "parado");
  const todos = deploys.flat().map((d) => ({ id: d.id, projeto: d.projeto, estado: estado(d.status), data: d.createdAt, url: d.staticUrl ? `https://${d.staticUrl}` : d.url ?? "" })).sort((a, b) => b.data.localeCompare(a.data));
  return {
    projetos: lista.map((p) => {
      const ultimo = todos.find((d) => d.projeto === p.name);
      return { id: p.id, nome: p.name, atualizado: p.updatedAt, estado: ultimo?.estado ?? "parado", url: ultimo?.url ?? "" };
    }),
    deploys: todos.slice(0, 20),
  };
}

export async function lerJira(chave: string, pedir: Pedir) {
  const c = lerJson<{ site: string; email: string; token: string }>(chave);
  const site = urlPublicaSegura(String(c.site ?? ""));
  const h = { authorization: `Basic ${Buffer.from(`${texto(c.email, 200)}:${String(c.token ?? "")}`).toString("base64")}` };
  const base = `${site.origin}/rest/api/3`;
  const jql = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
  const [eu, busca] = await Promise.all([
    pedir<{ displayName: string }>(`${base}/myself`, h),
    pedir<{ issues: { key: string; fields: { summary: string; status?: { name: string; statusCategory?: { key: string } }; priority?: { name: string } | null; duedate?: string | null; updated: string; project?: { name: string } } }[] }>(
      `${base}/search/jql?${new URLSearchParams({ jql, maxResults: "30", fields: "summary,status,priority,duedate,updated,project" })}`,
      h,
    ),
  ]);
  return {
    usuario: eu.displayName,
    site: site.origin,
    issues: busca.issues.map((i) => ({
      id: i.key, titulo: i.fields.summary, estado: i.fields.status?.name ?? "", categoria: i.fields.status?.statusCategory?.key ?? "", prioridade: i.fields.priority?.name ?? "",
      prazo: i.fields.duedate ?? null, atualizada: i.fields.updated, projeto: i.fields.project?.name ?? "", url: `${site.origin}/browse/${i.key}`,
    })),
  };
}

export async function lerTrello(chave: string, pedir: Pedir) {
  const c = lerJson<{ chave: string; token: string }>(chave);
  const auth = new URLSearchParams({ key: String(c.chave ?? ""), token: String(c.token ?? "") });
  const base = "https://api.trello.com/1/members/me";
  const [eu, quadros, cartoes] = await Promise.all([
    pedir<{ fullName: string; username: string }>(`${base}?fields=fullName,username&${auth}`, {}),
    pedir<{ id: string; name: string; shortUrl: string; dateLastActivity: string | null }[]>(`${base}/boards?filter=open&fields=name,shortUrl,dateLastActivity&${auth}`, {}),
    pedir<{ id: string; name: string; due: string | null; dueComplete: boolean; idBoard: string; shortUrl: string; dateLastActivity: string; labels: { name: string; color: string | null }[] }[]>(`${base}/cards?filter=open&fields=name,due,dueComplete,idBoard,shortUrl,dateLastActivity,labels&${auth}`, {}),
  ]);
  const nomeDoQuadro = new Map(quadros.map((q) => [q.id, q.name]));
  return {
    usuario: eu.fullName || eu.username,
    quadros: quadros.map((q) => ({ id: q.id, nome: q.name, url: q.shortUrl, atividade: q.dateLastActivity })).sort((a, b) => (b.atividade ?? "").localeCompare(a.atividade ?? "")).slice(0, 15),
    cartoes: cartoes
      .map((k) => ({ id: k.id, titulo: k.name, prazo: k.due, concluido: k.dueComplete, quadro: nomeDoQuadro.get(k.idBoard) ?? "", url: k.shortUrl, atividade: k.dateLastActivity, etiquetas: k.labels.map((l) => l.name).filter(Boolean) }))
      .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"))
      .slice(0, 40),
  };
}

const AGENTE_DO_DISCORD = "DiscordBot (https://github.com/vitorcgo/niko, 1)";

export async function lerDiscord(chave: string, pedir: Pedir) {
  const c = lerJson<{ token: string; usuario: string; canais: string[] }>(chave);
  const h = { authorization: `Bot ${String(c.token ?? "")}`, "user-agent": AGENTE_DO_DISCORD };
  const base = "https://discord.com/api/v10";
  const usuario = /^\d{5,25}$/.test(String(c.usuario ?? "")) ? String(c.usuario) : "";
  const canais = (Array.isArray(c.canais) ? c.canais : []).filter((x): x is string => typeof x === "string" && /^\d{5,25}$/.test(x)).slice(0, 8);
  const [bot, servidores] = await Promise.all([
    pedir<{ username: string }>(`${base}/users/@me`, h),
    pedir<{ id: string; name: string }[]>(`${base}/users/@me/guilds`, h),
  ]);
  const nomeDoServidor = new Map(servidores.map((s) => [s.id, s.name]));
  const mensagens: { id: string; canal: string; servidor: string; autor: string; texto: string; data: string; mencionaMe: boolean; url: string }[] = [];
  const falhas: string[] = [];
  for (const canalId of canais) {
    try {
      const canal = await pedir<{ id: string; name?: string; guild_id?: string }>(`${base}/channels/${canalId}`, h);
      const lista = await pedir<{ id: string; content: string; timestamp: string; author: { username: string; global_name?: string | null }; mentions?: { id: string }[]; mention_everyone?: boolean }[]>(`${base}/channels/${canalId}/messages?limit=10`, h);
      for (const m of lista) {
        mensagens.push({
          id: m.id,
          canal: canal.name ? `#${canal.name}` : canalId,
          servidor: canal.guild_id ? nomeDoServidor.get(canal.guild_id) ?? "" : "",
          autor: m.author.global_name || m.author.username,
          texto: m.content.slice(0, 400),
          data: m.timestamp,
          mencionaMe: Boolean(usuario) && ((m.mentions ?? []).some((u) => u.id === usuario) || m.content.includes(`<@${usuario}>`)),
          url: canal.guild_id ? `https://discord.com/channels/${canal.guild_id}/${canalId}/${m.id}` : "",
        });
      }
    } catch (e) {
      falhas.push(`${canalId}: ${(e as Error).message.slice(0, 40)}`);
    }
  }
  if (canais.length > 0 && falhas.length === canais.length && mensagens.length === 0) throw new Error(`discord_sem_acesso_aos_canais ${falhas[0]}`);
  return {
    bot: bot.username,
    servidores: servidores.map((s) => ({ id: s.id, nome: s.name })),
    mensagens: mensagens.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 40),
    mencoes: mensagens.filter((m) => m.mencionaMe).length,
    falhas,
  };
}

export function caminhoJsonDoReddit(caminho: string): string {
  if (caminho.endsWith(".json")) return caminho;
  if (caminho.endsWith(".rss")) return `${caminho.slice(0, -4)}.json`;
  return `${caminho}.json`;
}

export async function lerReddit(chave: string) {
  const c = lerJson<{ feed: string }>(chave);
  const url = urlPublicaSegura(String(c.feed ?? ""), (h) => h === "www.reddit.com" || h === "old.reddit.com" || h === "reddit.com");
  url.pathname = caminhoJsonDoReddit(url.pathname);
  if (!url.searchParams.get("feed") || !url.searchParams.get("user")) throw new Error("reddit_link_sem_token");
  const listagem = JSON.parse(await textoLimitado(url.toString(), { accept: "application/json" }, 2_000_000)) as { data?: { children?: { kind: string; data: Record<string, unknown> }[] } };
  const itens = (listagem.data?.children ?? []).map(({ kind, data: d }) => ({
    id: texto(d.name, 40) || texto(d.id, 40),
    tipo: kind === "t1" ? "comentario" : kind === "t4" ? "mensagem" : "outro",
    autor: texto(d.author, 60),
    assunto: texto(d.subject, 200) || texto(d.link_title, 200),
    texto: texto(d.body, 400),
    subreddit: texto(d.subreddit, 60),
    naoLida: d.new === true,
    data: typeof d.created_utc === "number" ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString(),
    link: typeof d.context === "string" && d.context.startsWith("/") ? `https://www.reddit.com${d.context}` : "https://www.reddit.com/message/inbox",
  }));
  return { usuario: url.searchParams.get("user") ?? "", itens: itens.slice(0, 30), naoLidas: itens.filter((i) => i.naoLida).length };
}

const acessosDoStrava = new Map<string, { token: string; expira: number }>();

export async function autorizarStrava(clienteId: string, segredo: string) {
  if (!/^\d{1,12}$/.test(clienteId) || segredo.length < 10) throw new Error("strava_cliente_invalido");
  const { codigo } = await receberCodigoNoNavegador("Strava", (redirecionamento, estado) =>
    `https://www.strava.com/oauth/authorize?${new URLSearchParams({ client_id: clienteId, redirect_uri: redirecionamento, response_type: "code", approval_prompt: "auto", scope: "read,activity:read_all", state: estado })}`,
  );
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clienteId, client_secret: segredo, code: codigo, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await r.json()) as { access_token?: string; refresh_token?: string; expires_at?: number; message?: string };
  if (!r.ok || !json.refresh_token || !json.access_token) throw new Error(json.message ?? `http_${r.status}`);
  acessosDoStrava.set(json.refresh_token, { token: json.access_token, expira: (json.expires_at ?? 0) * 1000 - 300_000 });
  return JSON.stringify({ clienteId, segredo, refresh: json.refresh_token });
}

async function acessoDoStrava(chave: string): Promise<string> {
  const c = lerJson<{ clienteId: string; segredo: string; refresh: string }>(chave);
  const refresh = String(c.refresh ?? "");
  const guardado = acessosDoStrava.get(refresh);
  if (guardado && guardado.expira > Date.now()) return guardado.token;
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: String(c.clienteId ?? ""), client_secret: String(c.segredo ?? ""), grant_type: "refresh_token", refresh_token: refresh }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await r.json()) as { access_token?: string; refresh_token?: string; expires_at?: number; message?: string };
  if (!r.ok || !json.access_token) throw new Error(`strava_${json.message ?? r.status}`);
  const novoRefresh = json.refresh_token ?? refresh;
  if (novoRefresh !== refresh) await gravarSegredo("conexao-strava", JSON.stringify({ ...c, refresh: novoRefresh }));
  acessosDoStrava.set(novoRefresh, { token: json.access_token, expira: (json.expires_at ?? 0) * 1000 - 300_000 });
  return json.access_token;
}

export async function lerStrava(chave: string, pedir: Pedir) {
  const h = { authorization: `Bearer ${await acessoDoStrava(chave)}` };
  const base = "https://www.strava.com/api/v3";
  const atleta = await pedir<{ id: number; firstname: string; lastname: string }>(`${base}/athlete`, h);
  type Totais = { count: number; distance: number; moving_time: number; elevation_gain: number };
  const [atividades, estatisticas] = await Promise.all([
    pedir<{ id: number; name: string; sport_type: string; distance: number; moving_time: number; total_elevation_gain: number; start_date: string; average_heartrate?: number }[]>(`${base}/athlete/activities?per_page=20`, h),
    pedir<{ recent_run_totals: Totais; recent_ride_totals: Totais; recent_swim_totals: Totais; ytd_run_totals: Totais; ytd_ride_totals: Totais }>(`${base}/athletes/${atleta.id}/stats`, h).catch(() => null),
  ]);
  const totais = (t?: Totais) => (t ? { vezes: t.count, metros: Math.round(t.distance), segundos: t.moving_time, subida: Math.round(t.elevation_gain) } : null);
  return {
    atleta: `${atleta.firstname} ${atleta.lastname}`.trim(),
    atividades: atividades.map((a) => ({ id: String(a.id), nome: a.name, esporte: a.sport_type, metros: Math.round(a.distance), segundos: a.moving_time, subida: Math.round(a.total_elevation_gain), data: a.start_date, batimentos: a.average_heartrate ? Math.round(a.average_heartrate) : null, url: `https://www.strava.com/activities/${a.id}` })),
    ultimas4Semanas: estatisticas ? { corrida: totais(estatisticas.recent_run_totals), pedal: totais(estatisticas.recent_ride_totals), natacao: totais(estatisticas.recent_swim_totals) } : null,
    noAno: estatisticas ? { corrida: totais(estatisticas.ytd_run_totals), pedal: totais(estatisticas.ytd_ride_totals) } : null,
  };
}

export async function lerEmail(chave: string) {
  const c = lerJson<{ servidor: string; porta: number; usuario: string; senha: string }>(chave);
  const servidor = texto(c.servidor, 200).toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(servidor)) throw new Error("email_servidor_invalido");
  if (alcanceDoEndereco(servidor) !== "internet") throw new Error("url_da_rede_local");
  const porta = Number(c.porta) || 993;
  const caixa = await lerCaixaDeEntrada({ servidor, porta, usuario: texto(c.usuario, 200), senha: String(c.senha ?? "") });
  return { conta: texto(c.usuario, 200), ...caixa };
}

const LIMITE_DO_ICS = 3_000_000;

export async function lerCalendarios(chave: string) {
  const c = lerJson<{ links: { url: string; nome?: string }[] }>(chave);
  const links = (Array.isArray(c.links) ? c.links : []).slice(0, 8);
  if (links.length === 0) throw new Error("calendario_sem_links");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ate = new Date(hoje.getTime() + 31 * 86400_000);
  const agendas = await Promise.all(
    links.map(async (l, i) => {
      try {
        const url = urlPublicaSegura(String(l.url ?? ""));
        const conteudo = await textoLimitado(url.toString(), { accept: "text/calendar" }, LIMITE_DO_ICS);
        if (!conteudo.includes("BEGIN:VCALENDAR")) throw new Error("calendario_link_nao_e_ics");
        const nome = texto(l.nome, 60) || nomeDaAgenda(conteudo, `Agenda ${i + 1}`);
        return { nome, eventos: eventosDoIcs(conteudo, nome, hoje, ate).slice(0, 300), erro: "" };
      } catch (e) {
        return { nome: texto(l.nome, 60) || `Agenda ${i + 1}`, eventos: [] as EventoIcs[], erro: (e as Error).message.slice(0, 80) };
      }
    }),
  );
  if (agendas.every((a) => a.erro)) throw new Error(agendas[0].erro);
  return {
    agendas: agendas.map((a) => ({ nome: a.nome, eventos: a.eventos.length, erro: a.erro })),
    eventos: agendas.flatMap((a) => a.eventos).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 400),
  };
}

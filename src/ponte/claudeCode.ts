export type FerramentaDeCodigo = "claude" | "codex" | "copilot" | "opencode" | "antigravity" | "kimi" | "gemini" | "amp";

export const FERRAMENTAS_DE_CODIGO: FerramentaDeCodigo[] = ["claude", "codex", "copilot", "opencode", "antigravity", "kimi", "gemini", "amp"];

export const FERRAMENTAS_QUE_APROVAM: FerramentaDeCodigo[] = ["claude", "codex", "copilot"];

export interface EstadoDaFerramenta {
  id: FerramentaDeCodigo;
  caminho: string;
  detectado: boolean;
  instalado: boolean;
  desatualizado: boolean;
  invalido: boolean;
}

export interface EventoClaude {
  id: string;
  recebidoEm: string;
  ferramenta?: FerramentaDeCodigo;
  evento: string;
  sessao: string;
  cwd: string;
  dados: Record<string, unknown>;
  pedidoId?: string;
}

export interface EstadoDaInstalacao {
  caminho: string;
  existe: boolean;
  claudeInstalado: boolean;
  invalido: boolean;
  instalado: boolean;
  parcial: boolean;
  eventos: string[];
  desatualizado: boolean;
  conectado: boolean;
}

export interface RegraSugerida {
  toolName: string;
  ruleContent: string;
}

export interface PreviaDaInstalacao {
  caminho: string;
  atual: string | null;
  proposto: string | null;
}

const CABECALHOS = { "x-niko": "1", "content-type": "application/json" };

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const r = await fetch(`/ponte/claude/${caminho}`, { ...opcoes, headers: CABECALHOS });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export const claudeCode = {
  instalacao: () => pedir<EstadoDaInstalacao>("instalacao"),
  previa: (acao: "instalar" | "remover") => pedir<PreviaDaInstalacao>(`previa?acao=${acao}`),
  instalar: () => pedir<{ caminho: string; copia: string | null }>("instalar", { method: "POST", body: JSON.stringify({ confirmacao: "INSTALAR" }) }),
  remover: () => pedir<{ caminho: string; copia: string | null }>("remover", { method: "POST", body: JSON.stringify({ confirmacao: "REMOVER" }) }),
  decidir: (pedidoId: string, decisao: "allow" | "deny" | "terminal", regra?: RegraSugerida) => pedir<{ ok: boolean }>("decisao", { method: "POST", body: JSON.stringify({ pedidoId, decisao, regra }) }),
  responder: (pedidoId: string, respostas: (number[] | string)[]) => pedir<{ ok: boolean }>("decisao", { method: "POST", body: JSON.stringify({ pedidoId, decisao: "allow", respostas }) }),
  abrir: (cwd: string, como: "vscode" | "pasta") => pedir<{ ok: boolean }>("abrir", { method: "POST", body: JSON.stringify({ cwd, como }) }),
  terminal: (sessao: string) => pedir<{ ok: boolean }>("terminal", { method: "POST", body: JSON.stringify({ sessao }) }),
  terminalNaFrente: (sessao: string) => pedir<{ naFrente: boolean }>("terminal-na-frente", { method: "POST", body: JSON.stringify({ sessao }) }),
  abrirArquivo: (cwd: string, arquivo: string) => pedir<{ ok: boolean }>("abrir", { method: "POST", body: JSON.stringify({ cwd, como: "arquivo", arquivo }) }),
};

async function pedirAgentes<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const r = await fetch(`/ponte/agentes${caminho}`, { ...opcoes, headers: CABECALHOS });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export const agentesDeCodigo = {
  estado: () => pedirAgentes<{ ferramentas: EstadoDaFerramenta[] }>(""),
  previa: (id: FerramentaDeCodigo, acao: "instalar" | "remover") => pedirAgentes<PreviaDaInstalacao>(`/${id}/previa?acao=${acao}`),
  instalar: (id: FerramentaDeCodigo) => pedirAgentes<{ caminho: string; copia: string | null }>(`/${id}/instalar`, { method: "POST", body: JSON.stringify({ confirmacao: "INSTALAR" }) }),
  remover: (id: FerramentaDeCodigo) => pedirAgentes<{ caminho: string; copia: string | null }>(`/${id}/remover`, { method: "POST", body: JSON.stringify({ confirmacao: "REMOVER" }) }),
};

export function ouvirClaudeCode(aoReceber: (e: EventoClaude) => void, aoMudarConexao: (ligado: boolean) => void): () => void {
  let vivo = true;
  let controle: AbortController | null = null;
  let espera = 1000;
  let temporizador = 0;

  const conectar = async () => {
    if (!vivo) return;
    controle = new AbortController();
    try {
      const r = await fetch("/ponte/claude/eventos", { headers: { "x-niko": "1" }, signal: controle.signal });
      if (!r.ok || !r.body) throw new Error(`http_${r.status}`);
      aoMudarConexao(true);
      espera = 1000;
      const leitor = r.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          try {
            aoReceber(JSON.parse(linha) as EventoClaude);
          } catch {
            continue;
          }
        }
      }
    } catch {
      if (!vivo) return;
    }
    aoMudarConexao(false);
    if (!vivo) return;
    temporizador = window.setTimeout(() => void conectar(), espera);
    espera = Math.min(espera * 2, 30000);
  };

  void conectar();
  return () => {
    vivo = false;
    window.clearTimeout(temporizador);
    controle?.abort();
  };
}

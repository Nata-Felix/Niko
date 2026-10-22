export type AlcanceDoEndereco = "este_pc" | "rede_local" | "internet";
export type ErroDoEndereco = "url_invalida" | "url_insegura" | "chave_sem_criptografia";

export interface SituacaoDoEndereco {
  url: string;
  alcance: AlcanceDoEndereco;
  semCriptografia: boolean;
  erro: ErroDoEndereco | null;
}

function octetos(host: string): number[] | null {
  const partes = host.split(".");
  if (partes.length !== 4 || partes.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const numeros = partes.map(Number);
  return numeros.every((n) => n <= 255) ? numeros : null;
}

export function alcanceDoEndereco(hostname: string): AlcanceDoEndereco {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return "este_pc";
  const ip = octetos(host);
  if (ip) {
    const [a, b] = ip;
    if (a === 127) return "este_pc";
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) return "rede_local";
    return "internet";
  }
  if (host.includes(":")) return /^(fc|fd|fe[89ab])/.test(host) ? "rede_local" : "internet";
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".home.arpa")) return "rede_local";
  return "internet";
}

export function situacaoDoEndereco(texto: string, comChave: boolean): SituacaoDoEndereco {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return { url: "", alcance: "internet", semCriptografia: false, erro: "url_invalida" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { url: "", alcance: "internet", semCriptografia: false, erro: "url_invalida" };
  const alcance = alcanceDoEndereco(url.hostname);
  const semCriptografia = url.protocol === "http:" && alcance !== "este_pc";
  const erro: ErroDoEndereco | null = url.protocol === "http:" && alcance === "internet" ? "url_insegura" : semCriptografia && comChave ? "chave_sem_criptografia" : null;
  return { url: url.href.replace(/\/$/, ""), alcance, semCriptografia, erro };
}

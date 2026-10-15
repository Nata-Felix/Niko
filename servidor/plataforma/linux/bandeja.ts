import { readlinkSync } from "node:fs";
import { dirname } from "node:path";
import type { ItemDaBandeja, Plataforma } from "../tipos.ts";
import { funcionou, iconeDoApp, lerArquivo, primeiraQueAbre, rodar } from "./comum.ts";

const LIMITE_MS = 3000;
const OBJETO_PADRAO = "/StatusNotifierItem";
const INTERFACES = ["org.kde.StatusNotifierItem", "org.freedesktop.StatusNotifierItem"];

interface ItemConhecido {
  servico: string;
  objeto: string;
  interface: string;
  pid: number;
}

type Variante = { type?: string; data?: unknown };

const conhecidos = new Map<string, ItemConhecido>();

async function chamar(argumentos: string[]): Promise<unknown[]> {
  const resposta = JSON.parse(await rodar("busctl", ["--user", "--json=short", ...argumentos], LIMITE_MS)) as { data?: unknown[] };
  return Array.isArray(resposta.data) ? resposta.data : [];
}

async function itensRegistrados(): Promise<string[]> {
  for (const observador of ["org.kde.StatusNotifierWatcher", "org.freedesktop.StatusNotifierWatcher"]) {
    try {
      const lista = await chamar(["get-property", observador, "/StatusNotifierWatcher", observador, "RegisteredStatusNotifierItems"]);
      return lista.filter((i): i is string => typeof i === "string");
    } catch {
      continue;
    }
  }
  return [];
}

function separar(registro: string): { servico: string; objeto: string } {
  const barra = registro.indexOf("/");
  return barra <= 0 ? { servico: registro, objeto: OBJETO_PADRAO } : { servico: registro.slice(0, barra), objeto: registro.slice(barra) };
}

function texto(propriedades: Record<string, Variante>, chave: string): string {
  const valor = propriedades[chave]?.data;
  return typeof valor === "string" ? valor.trim() : "";
}

function dicaDe(propriedades: Record<string, Variante>): string | null {
  const dados = propriedades.ToolTip?.data;
  if (!Array.isArray(dados)) return null;
  const titulo = typeof dados[2] === "string" ? dados[2].trim() : "";
  const corpo = typeof dados[3] === "string" ? dados[3].replace(/<[^>]+>/g, "").trim() : "";
  return [titulo, corpo].filter(Boolean).join("\n") || null;
}

async function pidDoServico(servico: string): Promise<number> {
  try {
    const [pid] = await chamar(["call", "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "GetConnectionUnixProcessID", "s", servico]);
    return typeof pid === "number" && pid > 0 ? pid : 0;
  } catch {
    return 0;
  }
}

async function lerItem(registro: string): Promise<ItemDaBandeja | null> {
  const { servico, objeto } = separar(registro);
  for (const nomeDaInterface of INTERFACES) {
    try {
      const [propriedades] = await chamar(["call", servico, objeto, "org.freedesktop.DBus.Properties", "GetAll", "s", nomeDaInterface]);
      if (!propriedades || typeof propriedades !== "object") continue;
      const p = propriedades as Record<string, Variante>;
      const pid = await pidDoServico(servico);
      const programa = pid > 0 ? (lerArquivo(`/proc/${pid}/comm`) ?? "") : "";
      const nome = texto(p, "Title") || texto(p, "Id") || programa || servico;
      const caminho = `sni:${servico}${objeto}`;
      conhecidos.set(caminho, { servico, objeto, interface: nomeDaInterface, pid });
      return { caminho, nome, dica: dicaDe(p), icone: iconeDoApp(texto(p, "IconName") || programa || undefined) };
    } catch {
      continue;
    }
  }
  return null;
}

async function bandeja(): Promise<{ itens: ItemDaBandeja[] }> {
  conhecidos.clear();
  const registros = await itensRegistrados();
  const itens = await Promise.all(registros.slice(0, 40).map(lerItem));
  return { itens: itens.filter((i): i is ItemDaBandeja => i !== null && !/^niko$/i.test(i.nome)) };
}

async function conhecido(caminho: string): Promise<ItemConhecido> {
  if (!conhecidos.has(caminho)) await bandeja();
  const item = conhecidos.get(caminho);
  if (!item) throw new Error("app_desconhecido");
  return item;
}

function executavel(pid: number): string | null {
  if (pid <= 0) return null;
  try {
    return readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return null;
  }
}

const abrirDaBandeja: Plataforma["controle"]["abrirDaBandeja"] = async (caminho) => {
  const item = await conhecido(caminho);
  for (const metodo of ["Activate", "SecondaryActivate"]) {
    if (await funcionou(rodar("busctl", ["--user", "call", item.servico, item.objeto, item.interface, metodo, "ii", "0", "0"], LIMITE_MS))) return { ok: true };
  }
  throw new Error("sem_janela");
};

const pastaDaBandeja: Plataforma["controle"]["pastaDaBandeja"] = async (caminho) => {
  const exe = executavel((await conhecido(caminho)).pid);
  if (!exe || !(await primeiraQueAbre([["xdg-open", [dirname(exe)]]]))) throw new Error("app_desconhecido");
  return { ok: true };
};

const encerrarDaBandeja: Plataforma["controle"]["encerrarDaBandeja"] = async (caminho) => {
  const { pid } = await conhecido(caminho);
  if (pid <= 1 || pid === process.pid || pid === process.ppid) throw new Error("app_desconhecido");
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    throw new Error("app_desconhecido");
  }
  conhecidos.delete(caminho);
  return { ok: true, encerrados: 1 };
};

export const bandejaDoLinux = { bandeja, abrirDaBandeja, pastaDaBandeja, encerrarDaBandeja };

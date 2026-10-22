import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import type { CartaoVisao, Evento, Meta, Pilar } from "../tipos";
import { gerarId } from "../utilitarios/basicos";
import { hojeISO } from "../utilitarios/datas";
import { validarEvento } from "../utilitarios/validacoes";

export const PILARES_PADRAO = ["Saúde", "Carreira", "Relacionamentos", "Crescimento", "Finanças"];

export interface DadosOrganizacao {
  pilares: Pilar[];
  metas: Meta[];
  visao: CartaoVisao[];
  eventos: Evento[];
}

interface EstadoOrganizacao extends DadosOrganizacao {
  garantirPilares: () => void;
  criarPilar: (nome: string) => void;
  atualizarPilar: (id: string, parcial: Partial<Pilar>) => void;
  excluirPilar: (id: string) => void;
  criarMeta: (dados: Omit<Meta, "id" | "historico">) => void;
  atualizarMeta: (id: string, parcial: Partial<Meta>) => void;
  registrarProgresso: (id: string, valor: number) => void;
  excluirMeta: (id: string) => void;
  criarVisao: (dados: Omit<CartaoVisao, "id">) => void;
  atualizarVisao: (id: string, parcial: Partial<CartaoVisao>) => void;
  excluirVisao: (id: string) => void;
  criarEvento: (dados: Omit<Evento, "id">) => Evento;
  atualizarEvento: (id: string, parcial: Partial<Evento>) => void;
  marcarEventoFeito: (id: string, data: string, feito: boolean) => void;
  excluirEvento: (id: string) => Evento | undefined;
  restaurarEvento: (e: Evento) => void;
  substituir: (dados: Partial<DadosOrganizacao>) => void;
}

export const useOrganizacao = create<EstadoOrganizacao>()(
  persist(
    (set, get) => ({
      pilares: [],
      metas: [],
      visao: [],
      eventos: [],
      garantirPilares: () => {
        if (get().pilares.length > 0) return;
        set({ pilares: PILARES_PADRAO.map((nome) => ({ id: gerarId(), nome, nota: 7 })) });
      },
      criarPilar: (nome) => set((s) => ({ pilares: [...s.pilares, { id: gerarId(), nome: nome.trim().slice(0, 40), nota: 5 }] })),
      atualizarPilar: (id, parcial) => set((s) => ({ pilares: s.pilares.map((p) => (p.id === id ? { ...p, ...parcial } : p)) })),
      excluirPilar: (id) => set((s) => ({ pilares: s.pilares.filter((p) => p.id !== id), metas: s.metas.filter((m) => m.pilarId !== id) })),
      criarMeta: (dados) =>
        set((s) => ({ metas: [...s.metas, { ...dados, nome: dados.nome.trim().slice(0, 80), id: gerarId(), historico: [{ data: hojeISO(), valor: dados.atual }] }] })),
      atualizarMeta: (id, parcial) => set((s) => ({ metas: s.metas.map((m) => (m.id === id ? { ...m, ...parcial, id: m.id, historico: m.historico, nome: (parcial.nome ?? m.nome).trim().slice(0, 80) } : m)) })),
      registrarProgresso: (id, valor) =>
        set((s) => ({
          metas: s.metas.map((m) =>
            m.id === id
              ? { ...m, atual: valor, historico: [...m.historico.filter((h) => h.data !== hojeISO()), { data: hojeISO(), valor }].slice(-120) }
              : m,
          ),
        })),
      excluirMeta: (id) => set((s) => ({ metas: s.metas.filter((m) => m.id !== id) })),
      criarVisao: (dados) => set((s) => ({ visao: [...s.visao, { ...dados, id: gerarId() }] })),
      atualizarVisao: (id, parcial) => set((s) => ({ visao: s.visao.map((v) => (v.id === id ? { ...v, ...parcial } : v)) })),
      excluirVisao: (id) => set((s) => ({ visao: s.visao.filter((v) => v.id !== id) })),
      criarEvento: (dados) => {
        validarEvento(dados);
        const evento = { ...dados, titulo: dados.titulo.trim().slice(0, 120), id: gerarId() };
        set((s) => ({ eventos: [...s.eventos, evento] }));
        return evento;
      },
      atualizarEvento: (id, parcial) => set((s) => ({ eventos: s.eventos.map((e) => {
        if (e.id !== id) return e;
        const novo = { ...e, ...parcial, id: e.id };
        validarEvento(novo);
        return novo;
      }) })),
      marcarEventoFeito: (id, data, feito) =>
        set((s) => ({
          eventos: s.eventos.map((e) => {
            if (e.id !== id) return e;
            const outros = (e.feitos ?? []).filter((d) => d !== data);
            return { ...e, feitos: (feito ? [...outros, data] : outros).sort().slice(-400) };
          }),
        })),
      excluirEvento: (id) => {
        const evento = get().eventos.find((e) => e.id === id);
        set((s) => ({ eventos: s.eventos.filter((e) => e.id !== id) }));
        return evento;
      },
      restaurarEvento: (e) => {
        validarEvento(e);
        set((s) => ({ eventos: s.eventos.some((x) => x.id === e.id) ? s.eventos : [...s.eventos, e] }));
      },
      substituir: (dados) => set(dados),
    }),
    { name: chave("organizacao"), storage: armazenamento },
  ),
);

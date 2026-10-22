import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import { armazenamento, chave } from "../ponte/armazenamento";
import type {
  Area,
  CartaoRevisao,
  ColunaKanban,
  DataImportante,
  LinkSalvo,
  Materia,
  Pagina,
  RegistroRevisao,
  RevisaoConteudo,
  TipoArea,
} from "../tipos";
import { gerarId } from "../utilitarios/basicos";
import { dataValida, deISO, hojeISO, paraISO } from "../utilitarios/datas";
import { exigir, textoObrigatorio, validarPaiPagina } from "../utilitarios/validacoes";
import { addDays } from "date-fns";

const agendador = fsrs();

function validarData(dados: Omit<DataImportante, "id" | "concluida">, materias: Materia[]) {
  textoObrigatorio(dados.titulo, 120);
  exigir(materias.some((m) => m.id === dados.materiaId));
  exigir(typeof dados.data === "string" && dataValida(dados.data));
  exigir(["prova", "entrega", "apresentacao", "inscricao", "outro"].includes(dados.tipo));
}

export const COLUNAS_POR_TIPO: Record<TipoArea, string[]> = {
  faculdade: ["A estudar", "Estudando", "Revisar", "Dominado"],
  idiomas: ["Vocabulário", "Praticando", "Dominado"],
  programacao: ["Ideias", "Fazendo", "Revisar", "Feito"],
  concurso: ["Edital", "Estudando", "Questões", "Dominado"],
  cursos: ["A ver", "Vendo", "Concluído"],
};

export const CORES_AREA = ["#3b6fe0", "#2f9e6b", "#d9922b", "#a855f7", "#e05a8a", "#0ea5a4"];

function colunasIniciais(tipo: TipoArea): ColunaKanban[] {
  const nomes = COLUNAS_POR_TIPO[tipo];
  return nomes.map((nome, i) => ({ id: gerarId(), nome, conclui: i === nomes.length - 1 }));
}

function deCard(base: Omit<CartaoRevisao, keyof ReturnType<typeof paraCampos>>, card: Card): CartaoRevisao {
  return { ...base, ...paraCampos(card) };
}

function paraCampos(card: Card) {
  return {
    vencimento: card.due.toISOString(),
    estabilidade: card.stability,
    dificuldade: card.difficulty,
    diasDecorridos: card.elapsed_days,
    diasAgendados: card.scheduled_days,
    repeticoes: card.reps,
    lapsos: card.lapses,
    estado: card.state,
    ultimaRevisao: card.last_review ? new Date(card.last_review).toISOString() : undefined,
    aprendizado: card.learning_steps,
  };
}

function paraCard(c: CartaoRevisao): Card {
  return {
    due: new Date(c.vencimento),
    stability: c.estabilidade,
    difficulty: c.dificuldade,
    elapsed_days: c.diasDecorridos,
    scheduled_days: c.diasAgendados,
    reps: c.repeticoes,
    lapses: c.lapsos,
    state: c.estado,
    last_review: c.ultimaRevisao ? new Date(c.ultimaRevisao) : undefined,
    learning_steps: c.aprendizado,
  };
}

export interface DadosEstudos {
  areas: Area[];
  materias: Materia[];
  paginas: Pagina[];
  datas: DataImportante[];
  cartoes: CartaoRevisao[];
  revisoesConteudo: RevisaoConteudo[];
  links: LinkSalvo[];
  registroRevisoes: RegistroRevisao[];
}

interface EstadoEstudos extends DadosEstudos {
  criarArea: (nome: string, tipo: TipoArea) => Area;
  excluirArea: (id: string) => void;
  criarMateria: (areaId: string, nome: string, semestre?: string) => Materia;
  atualizarMateria: (id: string, parcial: Partial<Materia>) => void;
  excluirMateria: (id: string) => void;
  criarPagina: (materiaId: string, paiId?: string) => Pagina;
  atualizarPagina: (id: string, parcial: Partial<Pagina>) => void;
  excluirPagina: (id: string) => void;
  marcarEstudada: (paginaId: string, intervalos?: number[]) => void;
  desmarcarEstudada: (paginaId: string) => void;
  concluirRevisaoConteudo: (id: string) => void;
  excluirRevisaoConteudo: (id: string) => RevisaoConteudo | undefined;
  restaurarRevisaoConteudo: (revisao: RevisaoConteudo) => void;
  criarData: (dados: Omit<DataImportante, "id" | "concluida">) => void;
  atualizarData: (id: string, parcial: Partial<DataImportante>) => void;
  excluirData: (id: string) => void;
  criarCartao: (materiaId: string, frente: string, verso: string) => void;
  excluirCartao: (id: string) => void;
  avaliarCartao: (id: string, nota: Grade) => void;
  salvarLink: (dados: Omit<LinkSalvo, "id" | "criadoEm">) => LinkSalvo;
  atualizarLink: (id: string, parcial: Partial<LinkSalvo>) => void;
  excluirLink: (id: string) => void;
  substituir: (dados: Partial<DadosEstudos>) => void;
}

export const useEstudos = create<EstadoEstudos>()(
  persist(
    (set, get) => ({
      areas: [],
      materias: [],
      paginas: [],
      datas: [],
      cartoes: [],
      revisoesConteudo: [],
      links: [],
      registroRevisoes: [],
      criarArea: (nome, tipo) => {
        nome = textoObrigatorio(nome, 60);
        exigir(Object.hasOwn(COLUNAS_POR_TIPO, tipo));
        const area: Area = { id: gerarId(), nome: nome.trim().slice(0, 60), tipo, cor: CORES_AREA[get().areas.length % CORES_AREA.length] };
        set((s) => ({ areas: [...s.areas, area] }));
        return area;
      },
      excluirArea: (id) =>
        set((s) => {
          const materias = s.materias.filter((m) => m.areaId === id).map((m) => m.id);
          const paginas = s.paginas.filter((p) => !materias.includes(p.materiaId));
          const restantes = new Set(paginas.map((p) => p.id));
          return {
            areas: s.areas.filter((a) => a.id !== id),
            materias: s.materias.filter((m) => m.areaId !== id),
            paginas,
            revisoesConteudo: s.revisoesConteudo.filter((r) => restantes.has(r.paginaId)),
            datas: s.datas.filter((d) => !materias.includes(d.materiaId)),
            cartoes: s.cartoes.filter((c) => !materias.includes(c.materiaId)),
          };
        }),
      criarMateria: (areaId, nome, semestre) => {
        const area = get().areas.find((a) => a.id === areaId);
        exigir(area);
        nome = textoObrigatorio(nome, 80);
        const materia: Materia = {
          id: gerarId(),
          areaId,
          nome: nome.trim().slice(0, 80),
          colunas: colunasIniciais(area?.tipo ?? "cursos"),
          semestre,
        };
        set((s) => ({ materias: [...s.materias, materia] }));
        return materia;
      },
      atualizarMateria: (id, parcial) => set((s) => ({ materias: s.materias.map((m) => {
        if (m.id !== id) return m;
        const nova = { ...m, ...parcial, id: m.id };
        exigir(s.areas.some((a) => a.id === nova.areaId));
        nova.nome = textoObrigatorio(nova.nome, 80);
        return nova;
      }) })),
      excluirMateria: (id) =>
        set((s) => {
          const paginas = s.paginas.filter((p) => p.materiaId !== id);
          const restantes = new Set(paginas.map((p) => p.id));
          return {
            materias: s.materias.filter((m) => m.id !== id),
            paginas,
            revisoesConteudo: s.revisoesConteudo.filter((r) => restantes.has(r.paginaId)),
            datas: s.datas.filter((d) => d.materiaId !== id),
            cartoes: s.cartoes.filter((c) => c.materiaId !== id),
          };
        }),
      criarPagina: (materiaId, paiId) => {
        exigir(get().materias.some((m) => m.id === materiaId));
        const pagina: Pagina = { id: gerarId(), materiaId, paiId, titulo: "", conteudo: "", atualizadaEm: new Date().toISOString() };
        validarPaiPagina(pagina, get().paginas);
        set((s) => ({ paginas: [...s.paginas, pagina] }));
        return pagina;
      },
      atualizarPagina: (id, parcial) =>
        set((s) => {
          const paginas = s.paginas.map((p) => p.id === id ? { ...p, ...parcial, id: p.id, atualizadaEm: new Date().toISOString() } : p);
          const p = paginas.find((p) => p.id === id);
          if (p) {
            exigir(s.materias.some((m) => m.id === p.materiaId));
            exigir(typeof p.titulo === "string" && typeof p.conteudo === "string");
            validarPaiPagina(p, paginas);
            exigir(!paginas.some((filha) => filha.paiId === p.id && filha.materiaId !== p.materiaId));
          }
          return { paginas };
        }),
      excluirPagina: (id) =>
        set((s) => {
          const remover = new Set([id]);
          let cresceu = true;
          while (cresceu) {
            cresceu = false;
            for (const p of s.paginas) if (p.paiId && remover.has(p.paiId) && !remover.has(p.id)) { remover.add(p.id); cresceu = true; }
          }
          return {
            paginas: s.paginas.filter((p) => !remover.has(p.id)),
            revisoesConteudo: s.revisoesConteudo.filter((r) => !remover.has(r.paginaId)),
          };
        }),
      marcarEstudada: (paginaId, intervalos = [1, 7, 30]) => {
        exigir(get().paginas.some((p) => p.id === paginaId));
        exigir(Array.isArray(intervalos) && intervalos.length <= 100 && intervalos.every((d) => Number.isInteger(d) && d >= 1 && d <= 3650));
        const hoje = hojeISO();
        set((s) => ({
          paginas: s.paginas.map((p) => (p.id === paginaId ? { ...p, estudadaEm: hoje } : p)),
          revisoesConteudo: [
            ...s.revisoesConteudo.filter((r) => r.paginaId !== paginaId || r.feita),
            ...intervalos.map((d) => ({ id: gerarId(), paginaId, data: paraISO(addDays(deISO(hoje), d)), feita: false })),
          ],
        }));
      },
      desmarcarEstudada: (paginaId) =>
        set((s) => ({
          paginas: s.paginas.map((p) => (p.id === paginaId ? { ...p, estudadaEm: undefined } : p)),
          revisoesConteudo: s.revisoesConteudo.filter((r) => r.paginaId !== paginaId || r.feita),
        })),
      concluirRevisaoConteudo: (id) => set((s) => ({ revisoesConteudo: s.revisoesConteudo.map((r) => (r.id === id ? { ...r, feita: true } : r)) })),
      excluirRevisaoConteudo: (id) => {
        const revisao = get().revisoesConteudo.find((r) => r.id === id);
        if (revisao) set((s) => ({ revisoesConteudo: s.revisoesConteudo.filter((r) => r.id !== id) }));
        return revisao;
      },
      restaurarRevisaoConteudo: (revisao) =>
        set((s) => (s.paginas.some((p) => p.id === revisao.paginaId) && !s.revisoesConteudo.some((r) => r.id === revisao.id) ? { revisoesConteudo: [...s.revisoesConteudo, revisao] } : s)),
      criarData: (dados) => {
        validarData(dados, get().materias);
        set((s) => ({ datas: [...s.datas, { ...dados, titulo: dados.titulo.trim(), id: gerarId(), concluida: false }] }));
      },
      atualizarData: (id, parcial) => set((s) => ({ datas: s.datas.map((d) => {
        if (d.id !== id) return d;
        const nova = { ...d, ...parcial, id: d.id };
        validarData(nova, s.materias);
        return nova;
      }) })),
      excluirData: (id) => set((s) => ({ datas: s.datas.filter((d) => d.id !== id) })),
      criarCartao: (materiaId, frente, verso) => {
        exigir(get().materias.some((m) => m.id === materiaId));
        frente = textoObrigatorio(frente, 500);
        verso = textoObrigatorio(verso, 2000);
        const base = { id: gerarId(), materiaId, frente: frente.trim().slice(0, 500), verso: verso.trim().slice(0, 2000) };
        set((s) => ({ cartoes: [...s.cartoes, deCard(base, createEmptyCard(new Date()))] }));
      },
      excluirCartao: (id) => set((s) => ({ cartoes: s.cartoes.filter((c) => c.id !== id) })),
      avaliarCartao: (id, nota) => {
        const cartao = get().cartoes.find((c) => c.id === id);
        if (!cartao) return;
        const resultado = agendador.next(paraCard(cartao), new Date(), nota);
        const hoje = hojeISO();
        set((s) => {
          const registro = s.registroRevisoes.find((r) => r.data === hoje);
          return {
            cartoes: s.cartoes.map((c) => (c.id === id ? deCard({ id: c.id, materiaId: c.materiaId, frente: c.frente, verso: c.verso }, resultado.card) : c)),
            registroRevisoes: registro
              ? s.registroRevisoes.map((r) => (r.data === hoje ? { ...r, quantidade: r.quantidade + 1 } : r))
              : [...s.registroRevisoes, { data: hoje, quantidade: 1 }],
          };
        });
      },
      salvarLink: (dados) => {
        const link: LinkSalvo = { ...dados, id: gerarId(), criadoEm: new Date().toISOString() };
        set((s) => ({ links: [link, ...s.links] }));
        return link;
      },
      atualizarLink: (id, parcial) => set((s) => ({ links: s.links.map((l) => (l.id === id ? { ...l, ...parcial } : l)) })),
      excluirLink: (id) => set((s) => ({ links: s.links.filter((l) => l.id !== id) })),
      substituir: (dados) => set(dados),
    }),
    { name: chave("estudos"), storage: armazenamento },
  ),
);

export function cartoesVencidos(cartoes: CartaoRevisao[], agora = new Date()): CartaoRevisao[] {
  return cartoes.filter((c) => new Date(c.vencimento) <= agora);
}

export function revisoesParaHoje(estado: Pick<DadosEstudos, "cartoes" | "revisoesConteudo">): number {
  const fimDoDia = new Date();
  fimDoDia.setHours(23, 59, 59, 999);
  const hoje = hojeISO();
  return cartoesVencidos(estado.cartoes, fimDoDia).length + estado.revisoesConteudo.filter((r) => !r.feita && r.data <= hoje).length;
}

export function previsaoIntervalos(cartao: CartaoRevisao, agora = new Date()): Record<1 | 2 | 3 | 4, number> {
  const previa = agendador.repeat(paraCard(cartao), agora);
  const ms = (r: Rating) => previa[r as Grade].card.due.getTime() - agora.getTime();
  return { 1: ms(Rating.Again), 2: ms(Rating.Hard), 3: ms(Rating.Good), 4: ms(Rating.Easy) };
}

export function descreverIntervalo(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d`;
  const meses = Math.round(d / 30);
  return meses < 12 ? `${meses} m` : `${(d / 365).toFixed(1).replace(".", ",")} a`;
}

import { create } from "zustand";
import type { Rota, ServicoId } from "../tipos";
import { gerarId } from "../utilitarios/basicos";
import { NATIVO, enviarComando, foraDoSistema, mostrarSistema } from "../desktop/desktop";
import { rotaLigada } from "../utilitarios/funcoes";

export interface AvisoRodape {
  id: string;
  texto: string;
  desfazer?: () => void;
}

export interface Geometria {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface JanelaConexao {
  id: ServicoId;
  z: number;
  minimizada: boolean;
  maximizada: boolean;
  geometria: Geometria;
}

interface EstadoInterface {
  janelasConexao: JanelaConexao[];
  zSistema: number;
  proximoZ: number;
  abrirJanelaConexao: (id: ServicoId) => void;
  abrirJanelaConexaoLocal: (id: ServicoId) => void;
  irParaLocal: (rota: Rota, parametros?: Record<string, string>) => void;
  fecharJanelaConexao: (id: ServicoId) => void;
  atualizarJanelaConexao: (id: ServicoId, parcial: Partial<JanelaConexao>) => void;
  focarSistema: () => void;
  focarConexao: (id: ServicoId) => void;
  rota: Rota;
  historico: Rota[];
  parametros: Record<string, string>;
  buscaAberta: boolean;
  capturaAberta: boolean;
  estilosDaMidiaAbertos: boolean;
  avisos: AvisoRodape[];
  sistemaAberto: boolean;
  sistemaMinimizado: boolean;
  sistemaMaximizado: boolean;
  geometria: Geometria;
  irPara: (rota: Rota, parametros?: Record<string, string>) => void;
  voltar: () => void;
  abrirBusca: (aberta: boolean) => void;
  abrirCaptura: (aberta: boolean) => void;
  abrirEstilosDaMidia: (abertos: boolean) => void;
  avisar: (texto: string, desfazer?: () => void) => void;
  dispensarAviso: (id: string) => void;
  definirSistema: (parcial: Partial<Pick<EstadoInterface, "sistemaAberto" | "sistemaMinimizado" | "sistemaMaximizado" | "geometria">>) => void;
}

function geometriaSalva(): Geometria | null {
  try {
    const bruto = localStorage.getItem("niko:janela-v2");
    if (!bruto) return null;
    const g = JSON.parse(bruto) as Geometria;
    if ([g.x, g.y, g.w, g.h].every((n) => Number.isFinite(n))) return g;
    return null;
  } catch {
    return null;
  }
}

const CHAVE_SISTEMA_ABERTO = "niko:sistema-aberto";

function sistemaAbertoSalvo(): boolean {
  if (NATIVO) return true;
  try {
    return localStorage.getItem(CHAVE_SISTEMA_ABERTO) !== "0";
  } catch {
    return true;
  }
}

function salvarSistemaAberto(aberto: boolean) {
  if (NATIVO) return;
  try {
    localStorage.setItem(CHAVE_SISTEMA_ABERTO, aberto ? "1" : "0");
  } catch {
    return;
  }
}

const temporizadores = new Map<string, number>();

export const useInterface = create<EstadoInterface>()((set, get) => ({
  janelasConexao: [],
  zSistema: 10,
  proximoZ: 11,
  abrirJanelaConexao: (id) => {
    if (foraDoSistema()) {
      enviarComando({ tipo: "abrirConexao", id });
      return;
    }
    get().abrirJanelaConexaoLocal(id);
  },
  abrirJanelaConexaoLocal: (id) => {
    const s = get();
    const existente = s.janelasConexao.find((j) => j.id === id);
    if (existente) {
      set({
        janelasConexao: s.janelasConexao.map((j) => (j.id === id ? { ...j, minimizada: false, z: s.proximoZ } : j)),
        proximoZ: s.proximoZ + 1,
      });
      return;
    }
    const deslocamento = s.janelasConexao.length * 28;
    const largura = Math.min(880, window.innerWidth - 80);
    const altura = Math.min(640, window.innerHeight - 160);
    set({
      janelasConexao: [
        ...s.janelasConexao,
        {
          id,
          z: s.proximoZ,
          minimizada: false,
          maximizada: false,
          geometria: {
            x: Math.max(16, (window.innerWidth - largura) / 2 + 60 + deslocamento),
            y: Math.max(56, (window.innerHeight - altura) / 2 - 20 + deslocamento),
            w: largura,
            h: altura,
          },
        },
      ],
      proximoZ: s.proximoZ + 1,
    });
  },
  fecharJanelaConexao: (id) => set((s) => ({ janelasConexao: s.janelasConexao.filter((j) => j.id !== id) })),
  atualizarJanelaConexao: (id, parcial) => set((s) => ({ janelasConexao: s.janelasConexao.map((j) => (j.id === id ? { ...j, ...parcial } : j)) })),
  focarSistema: () => {
    const s = get();
    if (s.zSistema === s.proximoZ - 1) return;
    set({ zSistema: s.proximoZ, proximoZ: s.proximoZ + 1 });
  },
  focarConexao: (id) => {
    const s = get();
    const j = s.janelasConexao.find((x) => x.id === id);
    if (!j || j.z === s.proximoZ - 1) return;
    set({ janelasConexao: s.janelasConexao.map((x) => (x.id === id ? { ...x, z: s.proximoZ } : x)), proximoZ: s.proximoZ + 1 });
  },
  rota: "inicio",
  historico: [],
  parametros: {},
  buscaAberta: false,
  capturaAberta: false,
  estilosDaMidiaAbertos: false,
  avisos: [],
  sistemaAberto: sistemaAbertoSalvo(),
  sistemaMinimizado: false,
  sistemaMaximizado: false,
  geometria: geometriaSalva() ?? { x: 0, y: 0, w: 0, h: 0 },
  irPara: (rota, parametros = {}) => {
    if (foraDoSistema()) {
      enviarComando({ tipo: "irPara", rota, parametros });
      return;
    }
    get().irParaLocal(rota, parametros);
  },
  irParaLocal: (rotaPedida, parametrosPedidos = {}) => {
    if (NATIVO) void mostrarSistema();
    const rota = rotaLigada(rotaPedida) ? rotaPedida : "inicio";
    const parametros = rota === rotaPedida ? parametrosPedidos : {};
    const atual = get();
    const mesmoDestino = atual.rota === rota && JSON.stringify(parametros) === JSON.stringify(atual.parametros);
    salvarSistemaAberto(true);
    set({
      rota,
      parametros: { ...parametros },
      historico: mesmoDestino ? atual.historico : [...atual.historico.slice(-30), atual.rota],
      sistemaAberto: true,
      sistemaMinimizado: false,
      zSistema: atual.proximoZ,
      proximoZ: atual.proximoZ + 1,
    });
  },
  voltar: () => {
    const { historico } = get();
    if (historico.length === 0) return;
    const anterior = historico[historico.length - 1];
    set({ rota: anterior, parametros: {}, historico: historico.slice(0, -1) });
  },
  abrirBusca: (aberta) => {
    if (aberta && foraDoSistema()) {
      enviarComando({ tipo: "abrirBusca" });
      return;
    }
    set({ buscaAberta: aberta });
  },
  abrirCaptura: (aberta) => {
    if (aberta && foraDoSistema()) {
      enviarComando({ tipo: "abrirCaptura" });
      return;
    }
    set({ capturaAberta: aberta });
  },
  abrirEstilosDaMidia: (abertos) => {
    if (abertos && foraDoSistema()) {
      enviarComando({ tipo: "abrirEstilosDaMidia" });
      return;
    }
    if (abertos && NATIVO) void mostrarSistema();
    set(abertos ? { estilosDaMidiaAbertos: true, sistemaAberto: true, sistemaMinimizado: false } : { estilosDaMidiaAbertos: false });
  },
  avisar: (texto, desfazer) => {
    const id = gerarId();
    set((s) => ({ avisos: [...s.avisos.slice(-2), { id, texto, desfazer }] }));
    temporizadores.set(id, window.setTimeout(() => get().dispensarAviso(id), desfazer ? 6000 : 3200));
  },
  dispensarAviso: (id) => {
    window.clearTimeout(temporizadores.get(id));
    temporizadores.delete(id);
    set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }));
  },
  definirSistema: (parcial) => {
    if (foraDoSistema()) {
      if (parcial.sistemaAberto || parcial.sistemaMinimizado === false) void mostrarSistema();
      return;
    }
    set(parcial);
    if (parcial.sistemaAberto !== undefined) salvarSistemaAberto(parcial.sistemaAberto);
    if (parcial.geometria) {
      try {
        localStorage.setItem("niko:janela-v2", JSON.stringify(parcial.geometria));
      } catch {
        return;
      }
    }
  },
}));

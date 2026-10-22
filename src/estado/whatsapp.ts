import { create } from "zustand";
import { whatsappPonte, type EstadoWhatsapp } from "../ponte/whatsapp";

interface EstadoDoWhatsappNaInterface {
  estado: EstadoWhatsapp | null;
  falhou: boolean;
  carregar: () => Promise<EstadoWhatsapp | null>;
  definir: (estado: EstadoWhatsapp) => void;
}

export const useWhatsapp = create<EstadoDoWhatsappNaInterface>()((set) => ({
  estado: null,
  falhou: false,
  carregar: async () => {
    try {
      const estado = await whatsappPonte.estado();
      set({ estado, falhou: false });
      return estado;
    } catch {
      set({ falhou: true });
      return null;
    }
  },
  definir: (estado) => set({ estado, falhou: false }),
}));

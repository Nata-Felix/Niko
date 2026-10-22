import { create } from "zustand";

interface ArquivosSoltos {
  paraOChat: File[];
  mandarAoChat: (arquivos: File[]) => void;
  retirarDoChat: () => File[];
}

export const useArquivosSoltos = create<ArquivosSoltos>()((set, get) => ({
  paraOChat: [],
  mandarAoChat: (arquivos) => set((s) => ({ paraOChat: [...s.paraOChat, ...arquivos] })),
  retirarDoChat: () => {
    const arquivos = get().paraOChat;
    set({ paraOChat: [] });
    return arquivos;
  },
}));

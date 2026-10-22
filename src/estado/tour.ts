import { create } from "zustand";

interface EstadoDoTour {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
}

export const useTour = create<EstadoDoTour>()((set) => ({
  aberto: false,
  abrir: () => set({ aberto: true }),
  fechar: () => set({ aberto: false }),
}));

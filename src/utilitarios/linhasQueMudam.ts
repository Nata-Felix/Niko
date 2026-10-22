export interface LinhaQueMuda {
  tipo: "entra" | "sai";
  texto: string;
}

function contarLinhas(linhas: string[]): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const linha of linhas) contagem.set(linha, (contagem.get(linha) ?? 0) + 1);
  return contagem;
}

function sobrando(linhas: string[], outras: string[]): string[] {
  const disponiveis = contarLinhas(outras);
  return linhas.filter((linha) => {
    const restantes = disponiveis.get(linha) ?? 0;
    if (restantes > 0) {
      disponiveis.set(linha, restantes - 1);
      return false;
    }
    return linha.trim() !== "";
  });
}

export function linhasQueMudam(antes: string | null, depois: string | null): LinhaQueMuda[] {
  const linhasAntes = (antes ?? "").replace(/\r\n/g, "\n").split("\n");
  const linhasDepois = (depois ?? "").replace(/\r\n/g, "\n").split("\n");
  return [
    ...sobrando(linhasAntes, linhasDepois).map((texto): LinhaQueMuda => ({ tipo: "sai", texto })),
    ...sobrando(linhasDepois, linhasAntes).map((texto): LinhaQueMuda => ({ tipo: "entra", texto })),
  ];
}

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { plataforma } from "./plataforma/index.ts";

const TEMPO_PARA_AUTORIZAR_MS = 180_000;

function pagina(servico: string, ok: boolean) {
  return `<!doctype html><meta charset="utf-8"><title>Niko</title><body style="font-family:system-ui;padding:40px;background:#0e0e10;color:#f1f2f4"><h2>${ok ? `${servico} conectado.` : "Não deu certo."}</h2><p>${ok ? "Pode fechar esta aba e voltar ao Niko." : "Volte ao Niko e tente de novo."}</p></body>`;
}

export function receberCodigoNoNavegador(servico: string, montarUrl: (redirecionamento: string, estado: string) => string): Promise<{ codigo: string; redirecionamento: string }> {
  const estado = randomBytes(16).toString("hex");
  return new Promise((resolver, rejeitar) => {
    let servidor: Server | null = null;
    const relogio = setTimeout(() => {
      servidor?.close();
      rejeitar(new Error("tempo_esgotado"));
    }, TEMPO_PARA_AUTORIZAR_MS);
    servidor = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const codigo = url.searchParams.get("code");
      const erro = url.searchParams.get("error");
      if (url.pathname !== "/" || url.searchParams.get("state") !== estado || (!codigo && !erro)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(pagina(servico, Boolean(codigo)));
      clearTimeout(relogio);
      const porta = (servidor?.address() as AddressInfo | null)?.port ?? 0;
      servidor?.close();
      if (codigo) resolver({ codigo, redirecionamento: `http://127.0.0.1:${porta}` });
      else rejeitar(new Error(erro ?? "autorizacao_negada"));
    });
    servidor.listen(0, "127.0.0.1", () => {
      const porta = (servidor?.address() as AddressInfo).port;
      try {
        plataforma.abrirNoNavegador(montarUrl(`http://127.0.0.1:${porta}`, estado));
      } catch (e) {
        clearTimeout(relogio);
        servidor?.close();
        rejeitar(e as Error);
      }
    });
  });
}

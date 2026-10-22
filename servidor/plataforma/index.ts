import type { Plataforma } from "./tipos.ts";
import { linux } from "./linux/index.ts";
import { windows } from "./windows/index.ts";

// Só Windows e Linux são suportados. Em outro sistema Unix (como o macOS no `pnpm dev`), a base Linux
// usa caminhos POSIX e falha com erro tratado onde faltar um comando, em vez de chamar o PowerShell.
if (process.platform !== "win32" && process.platform !== "linux") {
  process.stderr.write(`plataforma ${process.platform} não suportada: recursos do sistema podem ficar indisponíveis\n`);
}

export const plataforma: Plataforma = process.platform === "win32" ? windows : linux;

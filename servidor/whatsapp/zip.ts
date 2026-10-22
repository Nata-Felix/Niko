import { inflateRawSync } from "node:zlib";

const ASSINATURA_DO_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;
const TAMANHO_MAXIMO_EXTRAIDO = 200 * 1024 * 1024;

function fimDoDiretorio(zip: Buffer): number {
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === ASSINATURA_DO_FIM) return i;
  }
  throw new Error("zip_invalido");
}

export function nomesNoZip(zip: Buffer): string[] {
  const fim = fimDoDiretorio(zip);
  const total = zip.readUInt16LE(fim + 10);
  let posicao = zip.readUInt32LE(fim + 16);
  const nomes: string[] = [];
  for (let i = 0; i < total; i++) {
    if (zip.readUInt32LE(posicao) !== ASSINATURA_CENTRAL) throw new Error("zip_invalido");
    const tamanhoDoNome = zip.readUInt16LE(posicao + 28);
    const extra = zip.readUInt16LE(posicao + 30);
    const comentario = zip.readUInt16LE(posicao + 32);
    nomes.push(zip.toString("utf8", posicao + 46, posicao + 46 + tamanhoDoNome));
    posicao += 46 + tamanhoDoNome + extra + comentario;
  }
  return nomes;
}

export function extrairDoZip(zip: Buffer, nome: string): Buffer {
  const fim = fimDoDiretorio(zip);
  const total = zip.readUInt16LE(fim + 10);
  let posicao = zip.readUInt32LE(fim + 16);
  for (let i = 0; i < total; i++) {
    if (zip.readUInt32LE(posicao) !== ASSINATURA_CENTRAL) throw new Error("zip_invalido");
    const metodo = zip.readUInt16LE(posicao + 10);
    const compactado = zip.readUInt32LE(posicao + 20);
    const original = zip.readUInt32LE(posicao + 24);
    const tamanhoDoNome = zip.readUInt16LE(posicao + 28);
    const extra = zip.readUInt16LE(posicao + 30);
    const comentario = zip.readUInt16LE(posicao + 32);
    const local = zip.readUInt32LE(posicao + 42);
    const nomeDaEntrada = zip.toString("utf8", posicao + 46, posicao + 46 + tamanhoDoNome);
    posicao += 46 + tamanhoDoNome + extra + comentario;
    if (nomeDaEntrada !== nome) continue;
    if (original > TAMANHO_MAXIMO_EXTRAIDO) throw new Error("zip_grande_demais");
    if (zip.readUInt32LE(local) !== ASSINATURA_LOCAL) throw new Error("zip_invalido");
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const dados = zip.subarray(inicio, inicio + compactado);
    const conteudo = metodo === 0 ? Buffer.from(dados) : metodo === 8 ? inflateRawSync(dados, { maxOutputLength: TAMANHO_MAXIMO_EXTRAIDO }) : null;
    if (!conteudo) throw new Error("zip_metodo_desconhecido");
    if (conteudo.length !== original) throw new Error("zip_invalido");
    return conteudo;
  }
  throw new Error("zip_sem_arquivo");
}

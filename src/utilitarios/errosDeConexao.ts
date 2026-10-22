import { T } from "../textos/textos";

export function mensagemDeErroDaConexao(mensagem: string): string {
  const codigo = Object.keys(T.conexoes.errosDeConexao).find((c) => mensagem === c || mensagem.startsWith(`${c} `) || mensagem.startsWith(`${c}_`));
  return codigo ? T.conexoes.errosDeConexao[codigo] : mensagem;
}

import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { AvisoFaixa, Vazio } from "../../componentes/basicos";
import { T } from "../../textos/textos";
import { formatarMoedaCripto, type DadosServico, type IssueAtribuida } from "../../ponte/conexoesReais";
import { hojeISO, horarioRelativo, paraISO } from "../../utilitarios/datas";
import type { ServicoId } from "../../tipos";
import { Curva, Estado, Metrica, Tabela, dataCurta } from "./pecasDaJanela";

const X = T.janelaConexao.extras;
const C = X.colunas;
const M = X.metricas;

const SERVICOS_EXTRAS = ["linear", "jira", "trello", "railway", "discord", "reddit", "strava", "email", "calendario", "cripto"] as const;
type ServicoExtra = (typeof SERVICOS_EXTRAS)[number];

export function ehServicoExtra(s: ServicoId): s is ServicoExtra {
  return (SERVICOS_EXTRAS as readonly string[]).includes(s);
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  if (!/^https:\/\//.test(href)) return <>{children}</>;
  return (
    <a className="conexao-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ExternalLink size={11} />
    </a>
  );
}

const km = (metros: number) => `${(metros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
const duracao = (segundos: number) => (segundos >= 3600 ? `${Math.floor(segundos / 3600)} h ${Math.round((segundos % 3600) / 60)} min` : `${Math.round(segundos / 60)} min`);
const percentual = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`;
const quantidade = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 1 ? 4 : 8 });

function TabelaDeIssues({ issues, filtro }: { issues: IssueAtribuida[]; filtro: string }) {
  const hoje = hojeISO();
  return (
    <Tabela filtro={filtro} linhas={issues} colunas={[
      { titulo: C.issue, render: (l) => <Link href={l.url}><code>{l.id}</code></Link>, texto: (l) => l.id },
      { titulo: T.janelaConexao.colunas.titulo, render: (l) => <span className="privado">{l.titulo}</span>, texto: (l) => l.titulo },
      { titulo: C.estado, render: (l) => <span className="etiqueta">{l.estado}</span>, texto: (l) => l.estado },
      { titulo: C.prioridade, render: (l) => l.rotuloPrioridade ?? String(l.prioridade ?? ""), texto: (l) => l.rotuloPrioridade ?? String(l.prioridade ?? "") },
      { titulo: C.prazo, render: (l) => (l.prazo ? <span className={l.prazo.slice(0, 10) <= hoje ? "texto-alerta" : undefined}>{l.prazo.slice(0, 10).split("-").reverse().join("/")}</span> : "") },
      { titulo: C.atualizada, render: (l) => horarioRelativo(l.atualizada), direita: true },
    ]} />
  );
}

function VisaoDeIssues({ issues, filtro }: { issues: IssueAtribuida[]; filtro: string }) {
  const hoje = hojeISO();
  return (
    <div className="coluna">
      <div className="conexao-metricas">
        <Metrica rotulo={M.atribuidas} valor={issues.length} />
        <Metrica rotulo={M.vencemHoje} valor={issues.filter((i) => i.prazo?.slice(0, 10) === hoje).length} />
        <Metrica rotulo={M.atrasados} valor={issues.filter((i) => i.prazo && i.prazo.slice(0, 10) < hoje).length} />
      </div>
      <TabelaDeIssues issues={issues} filtro={filtro} />
    </div>
  );
}

export function ConteudoExtra({ servico, aba, filtro, dados }: { servico: ServicoExtra; aba: string; filtro: string; dados: DadosServico[ServicoId] }) {
  if (servico === "linear" || servico === "jira") {
    const d = dados as DadosServico["linear"];
    return aba === "issues" ? <TabelaDeIssues issues={d.issues} filtro={filtro} /> : <VisaoDeIssues issues={d.issues} filtro={filtro} />;
  }

  if (servico === "trello") {
    const d = dados as DadosServico["trello"];
    const agora = new Date().toISOString();
    const abertos = d.cartoes.filter((c) => !c.concluido);
    const cartoes = (
      <Tabela filtro={filtro} linhas={abertos} colunas={[
        { titulo: T.janelaConexao.colunas.titulo, render: (l) => <Link href={l.url}><span className="privado">{l.titulo}</span></Link>, texto: (l) => l.titulo },
        { titulo: C.quadro, render: (l) => l.quadro, texto: (l) => l.quadro },
        { titulo: C.etiquetas, render: (l) => <span className="linha">{l.etiquetas.map((e) => <span key={e} className="etiqueta">{e}</span>)}</span>, texto: (l) => l.etiquetas.join(" ") },
        { titulo: C.prazo, render: (l) => (l.prazo ? <span className={l.prazo < agora ? "texto-alerta" : undefined}>{dataCurta(l.prazo)}</span> : ""), direita: true },
      ]} />
    );
    if (aba === "cartoes") return cartoes;
    if (aba === "quadros")
      return <Tabela filtro={filtro} linhas={d.quadros} colunas={[
        { titulo: T.janelaConexao.colunas.nome, render: (l) => <Link href={l.url}>{l.nome}</Link>, texto: (l) => l.nome },
        { titulo: C.atualizada, render: (l) => (l.atividade ? horarioRelativo(l.atividade) : ""), direita: true },
      ]} />;
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.atribuidas} valor={abertos.length} />
          <Metrica rotulo={M.vencemHoje} valor={abertos.filter((c) => c.prazo && paraISO(new Date(c.prazo)) === hojeISO()).length} />
          <Metrica rotulo={M.atrasados} valor={abertos.filter((c) => c.prazo && c.prazo < agora).length} />
          <Metrica rotulo={M.quadros} valor={d.quadros.length} />
        </div>
        {cartoes}
      </div>
    );
  }

  if (servico === "railway") {
    const d = dados as DadosServico["railway"];
    const deploys = (
      <Tabela filtro={filtro} linhas={d.deploys} colunas={[
        { titulo: T.janelaConexao.colunas.projeto, render: (l) => l.projeto, texto: (l) => l.projeto },
        { titulo: T.janelaConexao.colunas.status, render: (l) => <Estado valor={l.estado} /> },
        { titulo: T.janelaConexao.colunas.dominio, render: (l) => (l.url ? <Link href={l.url}><code>{l.url.replace(/^https:\/\//, "")}</code></Link> : ""), texto: (l) => l.url },
        { titulo: T.janelaConexao.colunas.data, render: (l) => horarioRelativo(l.data), direita: true },
      ]} />
    );
    if (aba === "deploys") return deploys;
    if (aba === "projetos")
      return <Tabela filtro={filtro} linhas={d.projetos} colunas={[
        { titulo: T.janelaConexao.colunas.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: T.janelaConexao.colunas.status, render: (l) => <Estado valor={l.estado} /> },
        { titulo: T.janelaConexao.colunas.atualizado, render: (l) => horarioRelativo(l.atualizado), direita: true },
      ]} />;
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={T.janelaConexao.metricas.projetos} valor={d.projetos.length} />
          <Metrica rotulo={T.janelaConexao.metricas.prontos} valor={d.deploys.filter((x) => x.estado === "pronto").length} />
          <Metrica rotulo={M.comFalha} valor={d.projetos.filter((p) => p.estado === "erro").length} />
        </div>
        {deploys}
      </div>
    );
  }

  if (servico === "discord") {
    const d = dados as DadosServico["discord"];
    const tabela = (linhas: typeof d.mensagens) => (
      <Tabela filtro={filtro} linhas={linhas} colunas={[
        { titulo: T.janelaConexao.colunas.autor, render: (l) => <span className="privado">{l.autor}</span>, texto: (l) => l.autor },
        { titulo: C.canal, render: (l) => <Link href={l.url}>{`${l.servidor ? `${l.servidor} ` : ""}${l.canal}`}</Link>, texto: (l) => `${l.servidor} ${l.canal}` },
        { titulo: C.texto, render: (l) => <span className="privado cortar conexao-texto-longo">{l.texto}</span>, texto: (l) => l.texto },
        { titulo: T.janelaConexao.colunas.data, render: (l) => horarioRelativo(l.data), direita: true },
      ]} />
    );
    const avisos = (
      <>
        {d.mensagens.length === 0 && d.falhas.length === 0 && <AvisoFaixa>{X.semCanais}</AvisoFaixa>}
        {d.falhas.length > 0 && <AvisoFaixa tipo="alerta">{X.falhasDiscord(d.falhas.join(", "))}</AvisoFaixa>}
      </>
    );
    if (aba === "mencoes") return <>{avisos}{tabela(d.mensagens.filter((m) => m.mencionaMe))}</>;
    if (aba === "mensagens") return <>{avisos}{tabela(d.mensagens)}</>;
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.mencoes} valor={d.mencoes} />
          <Metrica rotulo={M.servidores} valor={d.servidores.length} />
        </div>
        {avisos}
        {tabela(d.mensagens.slice(0, 15))}
      </div>
    );
  }

  if (servico === "reddit") {
    const d = dados as DadosServico["reddit"];
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.naoLidas} valor={d.naoLidas} />
        </div>
        <Tabela filtro={filtro} linhas={d.itens} colunas={[
          { titulo: T.janelaConexao.colunas.de, render: (l) => <span className={`privado${l.naoLida ? " texto-forte" : ""}`}>u/{l.autor}</span>, texto: (l) => l.autor },
          { titulo: T.janelaConexao.colunas.assunto, render: (l) => <Link href={l.link}><span className="privado">{l.assunto || l.subreddit}</span></Link>, texto: (l) => `${l.assunto} ${l.subreddit}` },
          { titulo: T.janelaConexao.colunas.trecho, render: (l) => <span className="privado cortar conexao-texto-longo">{l.texto}</span>, texto: (l) => l.texto },
          { titulo: T.janelaConexao.colunas.data, render: (l) => horarioRelativo(l.data), direita: true },
        ]} />
      </div>
    );
  }

  if (servico === "strava") {
    const d = dados as DadosServico["strava"];
    const atividades = (
      <Tabela filtro={filtro} linhas={d.atividades} colunas={[
        { titulo: T.janelaConexao.colunas.nome, render: (l) => <Link href={l.url}>{l.nome}</Link>, texto: (l) => l.nome },
        { titulo: C.esporte, render: (l) => l.esporte, texto: (l) => l.esporte },
        { titulo: C.distancia, render: (l) => (l.metros ? km(l.metros) : ""), direita: true },
        { titulo: C.tempo, render: (l) => duracao(l.segundos), direita: true },
        { titulo: C.subida, render: (l) => (l.subida ? `${l.subida} m` : ""), direita: true },
        { titulo: C.batimentos, render: (l) => (l.batimentos ? `${l.batimentos} bpm` : ""), direita: true },
        { titulo: T.janelaConexao.colunas.data, render: (l) => dataCurta(l.data), direita: true },
      ]} />
    );
    if (aba === "atividades") return atividades;
    const totais = [d.ultimas4Semanas?.corrida, d.ultimas4Semanas?.pedal, d.ultimas4Semanas?.natacao];
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.km4Semanas} valor={km(totais.reduce((t, x) => t + (x?.metros ?? 0), 0))} />
          <Metrica rotulo={M.horas4Semanas} valor={duracao(totais.reduce((t, x) => t + (x?.segundos ?? 0), 0))} />
          <Metrica rotulo={M.treinos} valor={d.atividades.length} />
        </div>
        {atividades}
      </div>
    );
  }

  if (servico === "email") {
    const d = dados as DadosServico["email"];
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.naoLidas} valor={d.naoLidas} />
          <Metrica rotulo={M.total} valor={d.total.toLocaleString("pt-BR")} />
        </div>
        <Tabela filtro={filtro} linhas={d.mensagens} colunas={[
          { titulo: T.janelaConexao.colunas.de, render: (l) => <span className={`privado${l.lido ? "" : " texto-forte"}`} title={l.endereco}>{l.de}</span>, texto: (l) => `${l.de} ${l.endereco}` },
          { titulo: T.janelaConexao.colunas.assunto, render: (l) => <span className={`privado${l.lido ? "" : " texto-forte"}`}>{l.assunto}</span>, texto: (l) => l.assunto },
          { titulo: T.janelaConexao.colunas.data, render: (l) => horarioRelativo(l.data), direita: true },
        ]} />
      </div>
    );
  }

  if (servico === "calendario") {
    const d = dados as DadosServico["calendario"];
    const hoje = hojeISO();
    const daquiUmaSemana = new Date(Date.now() + 7 * 86400_000).toISOString();
    const eventos = (
      <Tabela filtro={filtro} linhas={d.eventos} colunas={[
        { titulo: C.quando, render: (l) => (l.diaInteiro ? `${dataCurta(l.inicio).split(",")[0]}, ${X.diaInteiro}` : dataCurta(l.inicio)) },
        { titulo: T.janelaConexao.colunas.titulo, render: (l) => <span className="privado">{l.titulo}</span>, texto: (l) => l.titulo },
        { titulo: T.janelaConexao.colunas.local, render: (l) => (l.local ? <span className="linha privado"><MapPin size={11} />{l.local}</span> : ""), texto: (l) => l.local },
        { titulo: C.agenda, render: (l) => <span className="linha"><CalendarDays size={11} />{l.agenda}</span>, texto: (l) => l.agenda },
      ]} />
    );
    const erros = d.agendas.filter((a) => a.erro);
    const avisos = erros.length > 0 && <AvisoFaixa tipo="alerta">{erros.map((a) => X.agendaComErro(a.nome, a.erro)).join(" · ")}</AvisoFaixa>;
    if (aba === "eventos") return <>{avisos}{d.eventos.length ? eventos : <Vazio titulo={X.semEventos} />}</>;
    if (aba === "agendas")
      return <Tabela filtro={filtro} linhas={d.agendas} colunas={[
        { titulo: T.janelaConexao.colunas.nome, render: (l) => l.nome, texto: (l) => l.nome },
        { titulo: T.janelaConexao.colunas.status, render: (l) => (l.erro ? <span className="etiqueta etiqueta-erro">{l.erro}</span> : <Estado valor="sucesso" />) },
        { titulo: T.janelaConexao.colunas.itens, render: (l) => l.eventos, direita: true },
      ]} />;
    return (
      <div className="coluna">
        <div className="conexao-metricas">
          <Metrica rotulo={M.hoje} valor={d.eventos.filter((e) => paraISO(new Date(e.inicio)) === hoje).length} />
          <Metrica rotulo={M.semana} valor={d.eventos.filter((e) => e.inicio <= daquiUmaSemana).length} />
          <Metrica rotulo={M.agendas} valor={d.agendas.length} />
        </div>
        {avisos}
        {d.eventos.length ? eventos : <Vazio titulo={X.semEventos} />}
      </div>
    );
  }

  const d = dados as DadosServico["cripto"];
  const paginaDaMoeda = (fonte: string, simbolo: string) =>
    fonte === "okx" ? `https://www.okx.com/trade-spot/${simbolo.toLowerCase()}-usdt` : `https://www.coinbase.com/advanced-trade/spot/${simbolo}-USD`;
  const cotacoes = (
    <Tabela filtro={filtro} linhas={d.cotacoes} colunas={[
      { titulo: C.moeda, render: (l) => <Link href={paginaDaMoeda(d.fonte, l.simbolo)}><b>{l.simbolo}</b></Link>, texto: (l) => l.simbolo },
      { titulo: C.preco, render: (l) => formatarMoedaCripto(l.preco, d.moeda), direita: true },
      { titulo: C.variacao, render: (l) => <span className={l.variacao24h >= 0 ? "texto-sucesso" : "texto-erro"}>{percentual(l.variacao24h)}</span>, direita: true },
      { titulo: "", render: (l) => <Curva pontos={l.curva} />, direita: true },
    ]} />
  );
  const carteira = d.carteira.posicoes.length ? (
    <Tabela filtro={filtro} linhas={d.carteira.posicoes} colunas={[
      { titulo: C.moeda, render: (l) => <b>{l.ativo}</b>, texto: (l) => l.ativo },
      { titulo: C.origem, render: (l) => <span className="privado">{l.origem}</span>, texto: (l) => l.origem },
      { titulo: C.quantidade, render: (l) => <span className="privado">{quantidade(l.quantidade)}</span>, direita: true },
      { titulo: C.valor, render: (l) => <span className="privado">{l.valor === null ? "" : formatarMoedaCripto(l.valor, d.moeda)}</span>, direita: true },
    ]} />
  ) : (
    <AvisoFaixa>{X.semCarteira}</AvisoFaixa>
  );
  const avisos = (
    <>
      {d.semCotacao.length > 0 && <AvisoFaixa tipo="alerta">{X.semCotacao(d.semCotacao.join(", "))}</AvisoFaixa>}
      {d.falhas.length > 0 && <AvisoFaixa tipo="alerta">{X.falhasCripto(d.falhas.join(" · "))}</AvisoFaixa>}
    </>
  );
  if (aba === "cotacoes") return <>{avisos}{cotacoes}</>;
  if (aba === "carteira") return <>{avisos}{carteira}</>;
  return (
    <div className="coluna">
      <div className="conexao-metricas">
        <Metrica rotulo={M.carteira} valor={d.carteira.posicoes.length ? formatarMoedaCripto(d.carteira.total, d.moeda) : "-"} />
        <Metrica rotulo={M.moedas} valor={d.cotacoes.length} />
      </div>
      {avisos}
      {cotacoes}
      <span className="campo-dica">{X.fonte(d.fonte)}</span>
    </div>
  );
}

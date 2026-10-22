import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { criarServidorDeTeste } from "./vite-para-testes.mjs";

const vite = await criarServidorDeTeste({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => vite.close());

const ics = await vite.ssrLoadModule("/servidor/ics.ts");
const imap = await vite.ssrLoadModule("/servidor/imap.ts");
const cripto = await vite.ssrLoadModule("/servidor/cripto.ts");
const extras = await vite.ssrLoadModule("/servidor/conexoesExtras.ts");

test("agenda ICS expande repetições, respeita exceções e fuso", () => {
  const texto = [
    "BEGIN:VCALENDAR",
    "X-WR-CALNAME:Trabalho",
    "BEGIN:VEVENT",
    "UID:a",
    "SUMMARY:Academia",
    "DTSTART;TZID=America/Sao_Paulo:20261019T070000",
    "DTEND;TZID=America/Sao_Paulo:20261019T080000",
    "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6",
    "EXDATE;TZID=America/Sao_Paulo:20261021T070000",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:b",
    "SUMMARY:Feriado\\, ponto",
    "DTSTART;VALUE=DATE:20261102",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:a",
    "RECURRENCE-ID;TZID=America/Sao_Paulo:20261023T070000",
    "SUMMARY:Academia (mais tarde)",
    "DTSTART;TZID=America/Sao_Paulo:20261023T090000",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  assert.equal(ics.nomeDaAgenda(texto, "x"), "Trabalho");
  const eventos = ics.eventosDoIcs(texto, "Trabalho", new Date("2026-10-18T00:00:00Z"), new Date("2026-11-10T00:00:00Z"));
  const academia = eventos.filter((e) => e.titulo === "Academia");
  assert.equal(academia.length, 4);
  assert.equal(academia[0].inicio, "2026-10-19T10:00:00.000Z");
  assert.ok(!academia.some((e) => e.inicio.startsWith("2026-10-21")));
  assert.ok(!academia.some((e) => e.inicio.startsWith("2026-10-23")));
  assert.ok(eventos.some((e) => e.titulo === "Academia (mais tarde)" && e.inicio === "2026-10-23T12:00:00.000Z"));
  assert.ok(eventos.some((e) => e.titulo === "Feriado, ponto" && e.diaInteiro));
});

test("IMAP lê envelope, assunto codificado e flags", () => {
  assert.equal(imap.decodificarCabecalho("=?UTF-8?B?w4kgaG9qZQ==?= =?ISO-8859-1?Q?reuni=E3o?="), "É hojereunião");
  assert.equal(imap.aspasImap('a"b\\c'), '"a\\"b\\\\c"');
  const linha = '* 5 FETCH (UID 812 FLAGS (\\Seen) INTERNALDATE "22-Oct-2026 09:15:00 -0300" ENVELOPE ("Thu, 22 Oct 2026 09:15:00 -0300" "=?UTF-8?Q?Or=C3=A7amento?=" (("Ana Lima" NIL "ana" "exemplo.com")) NIL NIL NIL NIL NIL NIL "<id@x>"))';
  const m = imap.cabecalhoDaResposta(linha);
  assert.equal(m.uid, 812);
  assert.equal(m.lido, true);
  assert.equal(m.assunto, "Orçamento");
  assert.equal(m.de, "Ana Lima");
  assert.equal(m.endereco, "ana@exemplo.com");
  assert.equal(m.data, "2026-10-22T12:15:00.000Z");
});

test("assinaturas das corretoras batem com os exemplos oficiais", () => {
  assert.equal(
    cripto.assinarBinance("symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559", "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j"),
    "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71",
  );
  assert.equal(
    cripto.assinarKraken("/0/private/AddOrder", "1616492376594", "nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25", "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg=="),
    "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==",
  );
  assert.equal(cripto.assinarOkx("2020-12-08T09:08:57.715Z", "GET", "/api/v5/account/balance", "", "s"), createHmac("sha256", "s").update("2020-12-08T09:08:57.715ZGET/api/v5/account/balance").digest("base64"));
  assert.equal(cripto.ativoDoKraken("XXBT"), "BTC");
  assert.equal(cripto.ativoDoKraken("ETH.F"), "ETH");
  assert.deepEqual(cripto.moedasDaLista("btc, Eth;sol btc x"), ["BTC", "ETH", "SOL"]);
  assert.equal(cripto.precoEmDolar("USDT", {}), 1);
  assert.equal(Math.round(cripto.precoEmDolar("BTC", { BTC: 0.00001 })), 100000);
  assert.ok(cripto.enderecoValido("ethereum", "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe"));
  assert.ok(!cripto.enderecoValido("bitcoin", "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe"));
  const config = cripto.configDaCripto(JSON.stringify({ moedas: "btc", moeda: "XYZ", alerta: 7, carteiras: [{ rede: "marte", endereco: "x" }] }));
  assert.deepEqual([config.moedas, config.moeda, config.alerta, config.carteiras.length], [["BTC"], "BRL", 0, 0]);
});

test("links de serviços externos não aceitam rede local nem http", () => {
  assert.equal(extras.urlPublicaSegura("webcal://p01-calendars.icloud.com/x.ics").protocol, "https:");
  assert.throws(() => extras.urlPublicaSegura("http://exemplo.com"), /url_precisa_https/);
  assert.throws(() => extras.urlPublicaSegura("https://192.168.0.5/agenda.ics"), /url_da_rede_local/);
  assert.throws(() => extras.urlPublicaSegura("https://localhost/x"), /url_da_rede_local/);
  assert.throws(() => extras.urlPublicaSegura("https://evil.com/x", (h) => h === "www.reddit.com"), /url_de_outro_servico/);
  assert.equal(extras.caminhoJsonDoReddit("/message/unread/.rss"), "/message/unread/.json");
  assert.equal(extras.caminhoJsonDoReddit("/message/inbox"), "/message/inbox.json");
  assert.equal(extras.caminhoJsonDoReddit("/message/inbox.json"), "/message/inbox.json");
});

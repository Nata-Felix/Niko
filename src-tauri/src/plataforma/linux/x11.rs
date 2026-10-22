use std::error::Error;
use std::sync::Mutex;

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{Atom, AtomEnum, ClientMessageEvent, ConnectionExt, EventMask, KeyButMask, Window};
use x11rb::rust_connection::RustConnection;

type Resultado<T> = Result<T, Box<dyn Error>>;

struct Atomos {
    janela_ativa: Atom,
    estado: Atom,
    maximizada_vertical: Atom,
    maximizada_horizontal: Atom,
    tela_cheia: Atom,
    oculta: Atom,
    pid: Atom,
    tipo: Atom,
    tipo_area_de_trabalho: Atom,
}

struct Conexao {
    conexao: RustConnection,
    raiz: Window,
    tela: usize,
    atomos: Atomos,
}

#[derive(Clone, Copy, Default)]
pub struct Geometria {
    pub x: i32,
    pub y: i32,
    pub largura: u32,
    pub altura: u32,
}

#[derive(Default)]
pub struct JanelaX11 {
    pub pid: u32,
    pub maximizada: bool,
    pub tela_cheia: bool,
    pub minimizada: bool,
    pub area_de_trabalho: bool,
    pub geometria: Option<Geometria>,
}

static CONEXAO: Mutex<Option<Conexao>> = Mutex::new(None);

fn atomo(conexao: &RustConnection, nome: &str) -> Resultado<Atom> {
    Ok(conexao.intern_atom(false, nome.as_bytes())?.reply()?.atom)
}

fn conectar() -> Resultado<Conexao> {
    let (conexao, tela) = x11rb::connect(None)?;
    let raiz = conexao.setup().roots.get(tela).ok_or("sem_tela")?.root;
    let atomos = Atomos {
        janela_ativa: atomo(&conexao, "_NET_ACTIVE_WINDOW")?,
        estado: atomo(&conexao, "_NET_WM_STATE")?,
        maximizada_vertical: atomo(&conexao, "_NET_WM_STATE_MAXIMIZED_VERT")?,
        maximizada_horizontal: atomo(&conexao, "_NET_WM_STATE_MAXIMIZED_HORZ")?,
        tela_cheia: atomo(&conexao, "_NET_WM_STATE_FULLSCREEN")?,
        oculta: atomo(&conexao, "_NET_WM_STATE_HIDDEN")?,
        pid: atomo(&conexao, "_NET_WM_PID")?,
        tipo: atomo(&conexao, "_NET_WM_WINDOW_TYPE")?,
        tipo_area_de_trabalho: atomo(&conexao, "_NET_WM_WINDOW_TYPE_DESKTOP")?,
    };
    Ok(Conexao { conexao, raiz, tela, atomos })
}

fn com_conexao<T>(acao: impl FnOnce(&Conexao) -> Resultado<T>) -> Option<T> {
    let mut guarda = CONEXAO.lock().ok()?;
    if guarda.is_none() {
        *guarda = conectar().ok();
    }
    let resultado = acao(guarda.as_ref()?);
    if resultado.is_err() {
        *guarda = None;
    }
    resultado.ok()
}

fn lista_de_u32(c: &Conexao, janela: Window, propriedade: Atom, tipo: impl Into<Atom>) -> Resultado<Vec<u32>> {
    let resposta = c.conexao.get_property(false, janela, propriedade, tipo, 0, 64)?.reply()?;
    Ok(resposta.value32().map(|valores| valores.collect()).unwrap_or_default())
}

pub fn janela_ativa() -> Option<u32> {
    com_conexao(|c| Ok(lista_de_u32(c, c.raiz, c.atomos.janela_ativa, AtomEnum::WINDOW)?.first().copied().unwrap_or(0))).filter(|id| *id != 0)
}

const NIVEIS_DE_DONO: usize = 8;

// Diálogos e janelas soltas de um app apontam para a janela principal em WM_TRANSIENT_FOR; é ela que diz
// se a tela está coberta (igual ao GA_ROOTOWNER no Windows).
pub fn janela_dona(janela: u32) -> u32 {
    let mut atual = janela;
    for _ in 0..NIVEIS_DE_DONO {
        let dona = com_conexao(|c| Ok(lista_de_u32(c, atual, AtomEnum::WM_TRANSIENT_FOR.into(), AtomEnum::WINDOW)?.first().copied().unwrap_or(0))).unwrap_or(0);
        if dona == 0 || dona == atual || dona == com_conexao(|c| Ok(c.raiz)).unwrap_or(0) {
            break;
        }
        atual = dona;
    }
    atual
}

pub fn pid_da_janela(janela: u32) -> Option<u32> {
    com_conexao(|c| Ok(lista_de_u32(c, janela, c.atomos.pid, AtomEnum::CARDINAL)?.first().copied().unwrap_or(0))).filter(|pid| *pid != 0)
}

fn geometria(c: &Conexao, janela: Window) -> Resultado<Geometria> {
    let tamanho = c.conexao.get_geometry(janela)?.reply()?;
    let posicao = c.conexao.translate_coordinates(janela, c.raiz, 0, 0)?.reply()?;
    Ok(Geometria { x: i32::from(posicao.dst_x), y: i32::from(posicao.dst_y), largura: u32::from(tamanho.width), altura: u32::from(tamanho.height) })
}

pub fn ler_janela(janela: u32) -> Option<JanelaX11> {
    com_conexao(|c| {
        let estados = lista_de_u32(c, janela, c.atomos.estado, AtomEnum::ATOM)?;
        let tipos = lista_de_u32(c, janela, c.atomos.tipo, AtomEnum::ATOM)?;
        let pid = lista_de_u32(c, janela, c.atomos.pid, AtomEnum::CARDINAL)?.first().copied().unwrap_or(0);
        let tem = |atomo: Atom| estados.contains(&atomo);
        Ok(JanelaX11 {
            pid,
            maximizada: tem(c.atomos.maximizada_vertical) && tem(c.atomos.maximizada_horizontal),
            tela_cheia: tem(c.atomos.tela_cheia),
            minimizada: tem(c.atomos.oculta),
            area_de_trabalho: tipos.contains(&c.atomos.tipo_area_de_trabalho),
            geometria: geometria(c, janela).ok(),
        })
    })
}

pub fn sem_compositor() -> bool {
    com_conexao(|c| {
        let gerente = atomo(&c.conexao, &format!("_NET_WM_CM_S{}", c.tela))?;
        Ok(c.conexao.get_selection_owner(gerente)?.reply()?.owner == x11rb::NONE)
    })
    .unwrap_or(false)
}

pub fn botao_pressionado() -> bool {
    com_conexao(|c| {
        let ponteiro = c.conexao.query_pointer(c.raiz)?.reply()?;
        let botoes = KeyButMask::BUTTON1 | KeyButMask::BUTTON2 | KeyButMask::BUTTON3;
        Ok(u16::from(ponteiro.mask) & u16::from(botoes) != 0)
    })
    .unwrap_or(false)
}

pub fn ativar(janela: u32) -> bool {
    com_conexao(|c| {
        let evento = ClientMessageEvent::new(32, janela, c.atomos.janela_ativa, [2, 0, 0, 0, 0]);
        c.conexao.send_event(false, c.raiz, EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY, evento)?;
        c.conexao.flush()?;
        Ok(())
    })
    .is_some()
}

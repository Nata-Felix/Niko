pub mod barra;
pub mod janela_frente;
pub mod miniaturas;
mod x11;

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_global_shortcut::Shortcut;

pub use barra::RECT;

pub fn preparar_ambiente() {
    if std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

pub fn tempo_ocioso_ms() -> u64 {
    let Ok(saida) = Command::new("gdbus")
        .args(["call", "--session", "--dest", "org.gnome.Mutter.IdleMonitor", "--object-path", "/org/gnome/Mutter/IdleMonitor/Core", "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
    else {
        return 0;
    };
    let texto = String::from_utf8_lossy(&saida.stdout);
    let digitos: String = texto.split_whitespace().nth(1).unwrap_or("").chars().take_while(|c| c.is_ascii_digit()).collect();
    digitos.parse::<u64>().unwrap_or(0)
}

static ULTIMA_FRENTE: AtomicU32 = AtomicU32::new(0);

pub fn registrar_frente(_app: &AppHandle) {
    let Some(frente) = x11::janela_ativa() else {
        ULTIMA_FRENTE.store(0, Ordering::Relaxed);
        return;
    };
    if frente != ULTIMA_FRENTE.load(Ordering::Relaxed) && x11::pid_da_janela(frente) != Some(std::process::id()) {
        ULTIMA_FRENTE.store(frente, Ordering::Relaxed);
    }
}

pub fn devolver_foco() {
    let anterior = ULTIMA_FRENTE.load(Ordering::Relaxed);
    if anterior != 0 {
        x11::ativar(anterior);
    }
}

pub fn janela_em_foco(janela: &WebviewWindow) -> bool {
    janela.is_focused().unwrap_or(false)
}

pub fn digita_com_altgr(_atalho: &Shortcut) -> bool {
    false
}

pub fn abrir_no_sistema(endereco: &str) -> Result<(), String> {
    let mut filho = Command::new("xdg-open").arg(endereco).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_| "falha_ao_abrir".to_string())?;
    std::thread::spawn(move || {
        let _ = filho.wait();
    });
    Ok(())
}

pub fn abrir_sistema_sem_esperar() -> bool {
    std::env::var("XDG_SESSION_TYPE").map_or(true, |s| !s.eq_ignore_ascii_case("wayland")) && x11::sem_compositor()
}

pub fn botao_do_mouse_pressionado() -> bool {
    x11::botao_pressionado()
}

pub const SOBREPOSTA_FOCAVEL_AO_CRIAR: bool = false;

pub fn ignorar_cursor(janela: &WebviewWindow, ignorar: bool) -> bool {
    if !janela.is_visible().unwrap_or(false) {
        return false;
    }
    let _ = janela.set_focusable(!ignorar);
    janela.set_ignore_cursor_events(ignorar).is_ok()
}

pub fn retangulo_da_janela(janela: &WebviewWindow) -> Option<RECT> {
    let posicao = janela.outer_position().ok()?;
    let tamanho = janela.outer_size().ok()?;
    Some(RECT { left: posicao.x, top: posicao.y, right: posicao.x + tamanho.width as i32, bottom: posicao.y + tamanho.height as i32 })
}

pub fn node_da_ponte(recursos: &Path) -> PathBuf {
    let embutido = recursos.join("node");
    if embutido.exists() {
        embutido
    } else {
        PathBuf::from("node")
    }
}

pub fn esconder_console(_comando: &mut Command) {}

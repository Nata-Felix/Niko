pub mod barra;
mod eventos_frente;
pub mod janela_frente;
pub mod miniaturas;
mod teclado;

pub use eventos_frente::vigiar_frente;

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicIsize, Ordering};

use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, SetForegroundWindow, SW_SHOWNORMAL};

pub use teclado::digita_com_altgr;
pub use windows::Win32::Foundation::RECT;

static ULTIMA_FRENTE: AtomicIsize = AtomicIsize::new(0);

pub fn preparar_ambiente() {}

pub fn tempo_ocioso_ms() -> u64 {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return 0;
    }
    u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime))
}

pub fn registrar_frente(app: &AppHandle) {
    let frente = unsafe { GetForegroundWindow() }.0 as isize;
    if frente == 0 {
        return;
    }
    let sobreposta = app.webview_windows().iter().any(|(r, j)| (r == "ilha" || r == "assistive" || crate::docks::eh_dock(r)) && j.hwnd().map(|h| h.0 as isize == frente).unwrap_or(false));
    if !sobreposta {
        ULTIMA_FRENTE.store(frente, Ordering::Relaxed);
    }
}

pub fn ultima_frente() -> isize {
    ULTIMA_FRENTE.load(Ordering::Relaxed)
}

unsafe fn trazer_para_frente(janela: HWND) -> bool {
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_MENU};
    use windows::Win32::UI::WindowsAndMessaging::{BringWindowToTop, GetWindowThreadProcessId, IsIconic, ShowWindow, SW_RESTORE};
    if IsIconic(janela).as_bool() {
        let _ = ShowWindow(janela, SW_RESTORE);
    }
    if SetForegroundWindow(janela).as_bool() {
        return true;
    }
    keybd_event(VK_MENU.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
    keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    if SetForegroundWindow(janela).as_bool() {
        return true;
    }
    let frente = GetForegroundWindow();
    let alvo = GetWindowThreadProcessId(frente, None);
    let eu = GetCurrentThreadId();
    let ligou = alvo != 0 && alvo != eu && AttachThreadInput(eu, alvo, true).as_bool();
    let _ = BringWindowToTop(janela);
    let ok = SetForegroundWindow(janela).as_bool();
    if ligou {
        let _ = AttachThreadInput(eu, alvo, false);
    }
    ok
}

pub fn agir_na_janela(acao: &str, id: isize) -> bool {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{IsWindow, PostMessageW, ShowWindow, SW_MINIMIZE, WM_CLOSE};
    let janela = HWND(id as *mut core::ffi::c_void);
    unsafe {
        if id == 0 || !IsWindow(Some(janela)).as_bool() {
            return false;
        }
        match acao {
            "focar" => trazer_para_frente(janela),
            "minimizar" => {
                let _ = ShowWindow(janela, SW_MINIMIZE);
                true
            }
            "fechar" => PostMessageW(Some(janela), WM_CLOSE, WPARAM(0), LPARAM(0)).is_ok(),
            _ => false,
        }
    }
}

pub fn devolver_foco() {
    let anterior = ULTIMA_FRENTE.load(Ordering::Relaxed);
    if anterior != 0 {
        unsafe {
            let _ = SetForegroundWindow(HWND(anterior as *mut core::ffi::c_void));
        }
    }
}

pub fn janela_em_foco(janela: &WebviewWindow) -> bool {
    janela.hwnd().map(|h| h.0 as isize == ULTIMA_FRENTE.load(Ordering::Relaxed)).unwrap_or(false)
}

pub fn abrir_no_sistema(endereco: &str) -> Result<(), String> {
    let largo: Vec<u16> = endereco.encode_utf16().chain(std::iter::once(0)).collect();
    let resultado = unsafe { windows::Win32::UI::Shell::ShellExecuteW(None, windows::core::w!("open"), windows::core::PCWSTR(largo.as_ptr()), None, None, SW_SHOWNORMAL) };
    if resultado.0 as isize > 32 {
        Ok(())
    } else {
        Err("falha_ao_abrir".into())
    }
}

pub fn botao_do_mouse_pressionado() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON};
    [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON].iter().any(|botao| {
        let estado = unsafe { GetAsyncKeyState(i32::from(botao.0)) } as u16;
        estado & 0x8000 != 0 || estado & 1 != 0
    })
}

pub const SOBREPOSTA_FOCAVEL_AO_CRIAR: bool = true;

pub fn abrir_sistema_sem_esperar() -> bool {
    false
}

// O DWM sempre compõe as janelas no Windows 10 e 11, então a transparência das sobrepostas sempre funciona.
pub fn sobrepostas_transparentes() -> bool {
    true
}

// No Windows o plugin de atalhos globais já funciona em qualquer janela.
pub fn atalhos_do_sistema(_atalhos: Vec<(String, String)>) {}

// No Windows a posição global do cursor é sempre confiável, então a janela inteira alterna entre ignorar e receber.
pub fn definir_area_de_entrada(_janela: &WebviewWindow, _caixas: Vec<[f64; 4]>) {}

pub fn ignorar_cursor(janela: &WebviewWindow, ignorar: bool) -> bool {
    janela.set_ignore_cursor_events(ignorar).is_ok()
}

pub fn retangulo_da_janela(janela: &WebviewWindow) -> Option<RECT> {
    let h = janela.hwnd().ok()?;
    let mut atual = RECT::default();
    unsafe { GetWindowRect(HWND(h.0), &mut atual) }.ok()?;
    Some(atual)
}

pub fn node_da_ponte(recursos: &Path) -> PathBuf {
    recursos.join("node.exe")
}

pub fn esconder_console(comando: &mut Command) {
    use std::os::windows::process::CommandExt;
    comando.creation_flags(0x0800_0000);
}

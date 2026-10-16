use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY};
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, IsZoomed, GWL_STYLE, WS_CAPTION};

const CLASSES_DO_SHELL: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

#[derive(Serialize, Default, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TipoDaFrente {
    #[default]
    AreaDeTrabalho,
    Sobreposta,
    App,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDaFrente {
    cobre: bool,
    tela_cheia: bool,
    maximizada: bool,
    na_base: bool,
    frente: TipoDaFrente,
    programa: String,
    #[serde(skip)]
    outro_monitor: bool,
}

unsafe fn programa_do_processo(pid: u32) -> String {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    let Ok(processo) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
    let mut caminho = [0u16; 1024];
    let mut tamanho = caminho.len() as u32;
    let leu = QueryFullProcessImageNameW(processo, PROCESS_NAME_WIN32, windows::core::PWSTR(caminho.as_mut_ptr()), &mut tamanho).is_ok();
    let _ = CloseHandle(processo);
    if !leu {
        return String::new();
    }
    String::from_utf16_lossy(&caminho[..tamanho as usize]).rsplit(['\\', '/']).next().unwrap_or("").to_lowercase()
}

fn windows_em_tela_cheia() -> bool {
    match unsafe { SHQueryUserNotificationState() } {
        Ok(estado) => estado == QUNS_RUNNING_D3D_FULL_SCREEN || estado == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

fn windows_ocupado_em_tela_cheia() -> bool {
    matches!(unsafe { SHQueryUserNotificationState() }, Ok(estado) if estado == QUNS_BUSY)
}

unsafe fn retangulos(janela: HWND, monitor: HMONITOR) -> Option<(RECT, RECT)> {
    let mut retangulo = RECT::default();
    GetWindowRect(janela, &mut retangulo).ok()?;
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    GetMonitorInfoW(monitor, &mut info).as_bool().then_some((retangulo, info.rcMonitor))
}

fn cobre_a_tela(janela: RECT, tela: RECT) -> bool {
    janela.left <= tela.left && janela.top <= tela.top && janela.right >= tela.right && janela.bottom >= tela.bottom
}

fn e_janela_do_sistema(app: &AppHandle, janela: HWND) -> bool {
    app.get_webview_window("sistema").and_then(|j| j.hwnd().ok()).map(|h| h.0 == janela.0).unwrap_or(false)
}

unsafe fn tem_barra_de_titulo(janela: HWND) -> bool {
    let estilo = GetWindowLongW(janela, GWL_STYLE) as u32;
    estilo & WS_CAPTION.0 == WS_CAPTION.0
}

unsafe fn janela_aberta(janela: HWND) -> bool {
    !janela.is_invalid() && IsWindow(Some(janela)).as_bool() && IsWindowVisible(janela).as_bool() && !IsIconic(janela).as_bool()
}

unsafe fn janela_atras_da_sobreposta() -> Option<HWND> {
    let anterior = HWND(super::ultima_frente() as *mut core::ffi::c_void);
    janela_aberta(anterior).then_some(anterior)
}

unsafe fn ler_janela_da_frente(app: &AppHandle, monitor_alvo: HMONITOR) -> EstadoDaFrente {
    let frente = GetForegroundWindow();
    if frente.is_invalid() {
        return EstadoDaFrente::default();
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(frente, Some(&mut pid));
    if pid == std::process::id() && !e_janela_do_sistema(app, frente) {
        let Some(atras) = janela_atras_da_sobreposta() else {
            return EstadoDaFrente { frente: TipoDaFrente::Sobreposta, ..Default::default() };
        };
        return EstadoDaFrente { frente: TipoDaFrente::Sobreposta, ..ler_janela(app, atras, monitor_alvo) };
    }
    ler_janela(app, frente, monitor_alvo)
}

unsafe fn ler_janela(app: &AppHandle, frente: HWND, monitor_alvo: HMONITOR) -> EstadoDaFrente {
    let mut pid = 0u32;
    GetWindowThreadProcessId(frente, Some(&mut pid));
    if pid == std::process::id() {
        if e_janela_do_sistema(app, frente) {
            return EstadoDaFrente { frente: TipoDaFrente::App, maximizada: IsZoomed(frente).as_bool(), ..Default::default() };
        }
        return EstadoDaFrente { frente: TipoDaFrente::Sobreposta, ..Default::default() };
    }
    let mut classe = [0u16; 64];
    let tamanho = GetClassNameW(frente, &mut classe).max(0) as usize;
    let nome = String::from_utf16_lossy(&classe[..tamanho]);
    if CLASSES_DO_SHELL.contains(&nome.as_str()) {
        return EstadoDaFrente::default();
    }
    let monitor = MonitorFromWindow(frente, MONITOR_DEFAULTTONEAREST);
    if monitor != monitor_alvo {
        return EstadoDaFrente { frente: TipoDaFrente::App, outro_monitor: true, ..Default::default() };
    }
    let maximizada = IsZoomed(frente).as_bool();
    let medidas = retangulos(frente, monitor);
    let cobre_monitor = medidas.is_some_and(|(janela, tela)| cobre_a_tela(janela, tela));
    let na_base = !IsIconic(frente).as_bool() && medidas.is_some_and(|(janela, tela)| super::super::encosta_na_base(janela, tela));
    let tela_cheia = cobre_monitor && (!maximizada || !tem_barra_de_titulo(frente) || windows_ocupado_em_tela_cheia());
    EstadoDaFrente { cobre: maximizada || cobre_monitor, tela_cheia, maximizada, na_base, frente: TipoDaFrente::App, programa: programa_do_processo(pid), outro_monitor: false }
}

#[tauri::command]
pub fn frente_cobre_tela(app: AppHandle, window: WebviewWindow) -> EstadoDaFrente {
    let monitor_alvo = match window.hwnd() {
        Ok(h) => unsafe { MonitorFromWindow(HWND(h.0), MONITOR_DEFAULTTONEAREST) },
        Err(_) => unsafe { MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY) },
    };
    let janela = unsafe { ler_janela_da_frente(&app, monitor_alvo) };
    let tela_cheia = janela.tela_cheia || (janela.cobre && windows_em_tela_cheia());
    EstadoDaFrente { cobre: janela.cobre || tela_cheia, tela_cheia, maximizada: janela.maximizada, na_base: janela.na_base, frente: if tela_cheia { TipoDaFrente::App } else { janela.frente }, programa: janela.programa, outro_monitor: janela.outro_monitor }
}

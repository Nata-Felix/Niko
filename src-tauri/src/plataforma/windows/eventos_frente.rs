// O Windows avisa na hora quando outra janela vem para a frente, é minimizada, maximizada ou movida.
// Sem isso, a ilha e o dock só percebiam na próxima consulta periódica e demoravam a sair da frente.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetMessageW, EVENT_OBJECT_LOCATIONCHANGE, EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MOVESIZEEND, MSG, OBJID_WINDOW,
    WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS,
};

pub const EVENTO_FRENTE_MUDOU: &str = "niko://frente-mudou";
const INTERVALO_MINIMO_MS: u64 = 120;

static APP: OnceLock<AppHandle> = OnceLock::new();
static ULTIMO_AVISO_MS: AtomicU64 = AtomicU64::new(0);

fn agora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

unsafe extern "system" fn ao_evento(_gancho: HWINEVENTHOOK, evento: u32, janela: HWND, objeto: i32, _filho: i32, _thread: u32, _tempo: u32) {
    // Mudança de posição chega a cada quadro de qualquer janela; só interessa a da janela da frente
    // (maximizar e restaurar), e com intervalo mínimo entre avisos.
    if evento == EVENT_OBJECT_LOCATIONCHANGE {
        if objeto != OBJID_WINDOW.0 || janela != GetForegroundWindow() {
            return;
        }
        let agora = agora_ms();
        if agora.saturating_sub(ULTIMO_AVISO_MS.load(Ordering::Relaxed)) < INTERVALO_MINIMO_MS {
            return;
        }
        ULTIMO_AVISO_MS.store(agora, Ordering::Relaxed);
    }
    if let Some(app) = APP.get() {
        let _ = app.emit(EVENTO_FRENTE_MUDOU, ());
    }
}

pub fn vigiar_frente(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    // Os ganchos fora de contexto entregam os avisos na fila de mensagens da thread que os criou.
    std::thread::spawn(|| unsafe {
        let faixas = [
            (EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND),
            (EVENT_SYSTEM_MOVESIZEEND, EVENT_SYSTEM_MOVESIZEEND),
            (EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND),
            (EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE),
        ];
        for (de, ate) in faixas {
            let _ = SetWinEventHook(de, ate, None, Some(ao_evento), 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        }
        let mut mensagem = MSG::default();
        while GetMessageW(&mut mensagem, None, 0, 0).as_bool() {}
    });
}

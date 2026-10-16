#[cfg(not(any(windows, target_os = "linux")))]
compile_error!("O Niko roda no Windows e no Linux.");

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use self::windows::*;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use self::linux::*;

pub fn mesmo_retangulo(a: RECT, b: RECT) -> bool {
    a.left == b.left && a.top == b.top && a.right == b.right && a.bottom == b.bottom
}

const FRACAO_DA_FAIXA_DO_DOCK: f64 = 0.085;

pub fn encosta_na_base(janela: RECT, tela: RECT) -> bool {
    let largura = f64::from(tela.right - tela.left);
    let altura = f64::from(tela.bottom - tela.top);
    if largura <= 0.0 || altura <= 0.0 {
        return false;
    }
    let faixa = f64::from(tela.bottom) - altura * FRACAO_DA_FAIXA_DO_DOCK;
    let quarto = f64::from(tela.left) + largura / 4.0;
    let tres_quartos = f64::from(tela.left) + largura * 3.0 / 4.0;
    f64::from(janela.bottom) > faixa && f64::from(janela.top) < faixa && f64::from(janela.left) < tres_quartos && f64::from(janela.right) > quarto
}

#[cfg(test)]
mod testes_da_base {
    use super::{encosta_na_base, RECT};

    fn r(left: i32, top: i32, right: i32, bottom: i32) -> RECT {
        RECT { left, top, right, bottom }
    }

    #[test]
    fn janela_que_desce_ate_o_dock_tira_o_dock_da_frente() {
        let tela = r(0, 0, 1920, 1080);
        assert!(encosta_na_base(r(560, 300, 1360, 1040), tela));
        assert!(!encosta_na_base(r(560, 200, 1360, 900), tela));
        assert!(!encosta_na_base(r(0, 600, 400, 1080), tela));
        assert!(!encosta_na_base(r(560, 1070, 1360, 1300), tela));
        assert!(encosta_na_base(r(2200, 500, 3000, 1400), r(1920, 0, 4480, 1440)));
    }
}

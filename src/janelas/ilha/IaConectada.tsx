import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Eye, Settings2 } from "lucide-react";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { estadoDaPonte, type Provedor } from "../../ponte/ponteLocal";
import { catalogoPelaUrl, provedorEntendeImagens } from "../../dados/provedoresIa";
import { LogoProvedor } from "../../modulos/configuracoes/SecaoIa";
import { modeloDoProvedor } from "../../utilitarios/assistente";
import { T } from "../../textos/textos";

const S = T.ilha.iaConectada;

function catalogoDe(p: Provedor) {
  return p.catalogo ?? catalogoPelaUrl(p.urlBase)?.id;
}

export function IaConectada() {
  const ia = useConfig((s) => s.ia);
  const irPara = useInterface((s) => s.irPara);
  const [provedores, setProvedores] = useState<Provedor[]>([]);
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    let vivo = true;
    void estadoDaPonte(aberta)
      .then((e) => vivo && setProvedores(e.provedores))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [aberta]);

  const emUso = provedores.find((p) => p.id === ia.provedorId);
  const ordem = [ia.provedorId, ...(ia.reservas ?? [])].filter(Boolean) as string[];
  const lista = [...provedores].sort((a, b) => (ordem.indexOf(a.id) + 1 || 99) - (ordem.indexOf(b.id) + 1 || 99));
  const papel = (p: Provedor) => (p.id === ia.provedorId ? S.emUso : ia.reservas.includes(p.id) ? S.reserva(ia.reservas.indexOf(p.id) + 1) : S.conectada);

  return (
    <div className="ia-conectada">
      <button type="button" className="ilha-botao ia-conectada-botao" aria-expanded={aberta} title={emUso ? S.titulo(emUso.nome) : S.nenhuma} onClick={() => setAberta((v) => !v)}>
        <LogoProvedor id={emUso ? catalogoDe(emUso) : undefined} tamanho={14} />
        <span className="cortar">{emUso?.nome ?? S.nenhuma}</span>
      </button>
      <AnimatePresence>
        {aberta && (
          <motion.div className="ia-conectada-painel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15 }}>
            <span className="ia-conectada-rotulo">{S.lista}</span>
            {lista.length === 0 ? (
              <span className="ia-conectada-vazio">{S.nenhuma}</span>
            ) : (
              lista.map((p) => (
                <div key={p.id} className="ia-conectada-item" data-em-uso={p.id === ia.provedorId || undefined}>
                  <LogoProvedor id={catalogoDe(p)} tamanho={14} />
                  <span className="ia-conectada-texto">
                    <b className="cortar">{p.nome}</b>
                    <span className="cortar">{modeloDoProvedor(p) || S.semModelo}</span>
                  </span>
                  {provedorEntendeImagens(p, ia.visao) && <Eye size={12} aria-label={S.visao} />}
                  <span className="ia-conectada-papel">{papel(p)}</span>
                </div>
              ))
            )}
            <button type="button" className="ia-conectada-configurar" onClick={() => {
              setAberta(false);
              irPara("ia");
            }}>
              <Settings2 size={12} />
              {S.configurar}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

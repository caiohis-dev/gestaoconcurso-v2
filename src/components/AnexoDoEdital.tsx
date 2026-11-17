/**
 * Um anexo do edital na prévia — o conteúdo programático ou as áreas de abrangência.
 *
 * 🔵 Fatia 12, etapa 2 (2026-11-16). Até aqui os dois anexos existiam só como EDITORES
 * (`ConteudoProgramatico`, `TerritorialidadeELotacao`) e nunca apareciam no documento.
 * Este componente só DESENHA o `AnexoMontado` de `src/lib/edital-documento.ts` — a ordem,
 * o agrupamento e o número saem de lá, e a exportação usa a mesma montagem.
 *
 * A forma segue os publicados: cabeçalho "ANEXO I" e título em caixa alta; as ementas
 * comuns marcadas "(COMUM A TODOS OS CARGOS)", como no Edital 002, e as demais sob
 * "CARGO: …", como no 004; as ruas numeradas por unidade, como no Anexo I do 004.
 */
import type { AnexoMontado } from "@/lib/edital-documento";
import { QuadroPendente } from "@/components/QuadroDoArtigo";

function Conteudo({ anexo }: { anexo: AnexoMontado }) {
  return (
    <div className="space-y-3">
      {anexo.conteudo!.map((bloco) => (
        <div key={bloco.cargo ?? "__comuns"} className="space-y-2">
          {bloco.cargo && <p className="font-semibold uppercase text-foreground">Cargo: {bloco.cargo}</p>}
          {bloco.disciplinas.map((d) => (
            <div key={d.nome}>
              <p className="font-medium uppercase text-foreground">
                {d.nome}
                {bloco.cargo === null && " (comum a todos os cargos)"}
              </p>
              <p className="whitespace-pre-wrap">{d.ementa}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Abrangencia({ anexo }: { anexo: AnexoMontado }) {
  return (
    <div className="space-y-3">
      {anexo.abrangencia!.map((u) => {
        let n = 0;
        return (
          <div key={u.unidade} className="space-y-1">
            <p className="font-semibold uppercase text-foreground">{u.unidade}</p>
            {u.secoes.map((secao, i) => (
              <div key={`${secao.bairro ?? ""}-${i}`}>
                {secao.bairro && <p className="font-medium text-foreground">{secao.bairro}:</p>}
                <ul className="pl-2">
                  {secao.logradouros.map((l) => {
                    n += 1;
                    return (
                      <li key={n}>
                        <span className="tabular-nums">{n}.</span> {l}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function AnexoDoEdital({ anexo }: { anexo: AnexoMontado }) {
  return (
    <section className="space-y-2 border-t pt-4 text-sm text-muted-foreground" aria-label={`Anexo ${anexo.numero}`}>
      <h3 className="text-center text-sm font-semibold uppercase text-foreground">
        Anexo {anexo.numero}
        <span className="block">{anexo.titulo}</span>
      </h3>
      {anexo.pendencia ? (
        <QuadroPendente motivo={anexo.pendencia} />
      ) : anexo.conteudo ? (
        <Conteudo anexo={anexo} />
      ) : anexo.abrangencia ? (
        <Abrangencia anexo={anexo} />
      ) : null}
    </section>
  );
}

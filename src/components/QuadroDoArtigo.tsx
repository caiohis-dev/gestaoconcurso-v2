/**
 * A tabela de um artigo `tipo = 'quadro'` — montada do DADO, nunca digitada.
 *
 * 🔴 **Por que nenhum quadro é digitável.** Levantadas todas as tabelas dos três editais
 * reais em 2026-09-16: nenhuma é de forma livre. Quadro I são os cargos, Quadro II é a
 * matriz da prova, os Quadros III/IV são os títulos, e os quadros de vagas por UBSF são
 * a territorialidade. A "Certidão Nada Consta do COREN" exigida de Agente Comunitário de
 * Saúde no Edital 004 é justamente copia-e-cola de tabela — o defeito que some quando a
 * tabela nasce do dado.
 *
 * Fonte nova exige FATIA nova, e a CHECK `chk_edital_item_quadro_fonte` no banco é o que
 * garante isso quando a tela não estiver no caminho.
 */
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCronograma } from "@/hooks/useCronograma";
import { useTitulos } from "@/hooks/useTitulos";
import { useTerritorialidade, useUnidadesLotacao } from "@/hooks/useTerritorialidade";
import { useProvaObjetiva } from "@/hooks/useProvaObjetiva";
import { useCargos } from "@/hooks/useCargos";
import { diaDaSemana } from "@/lib/edital-cronograma";
import type { QuadroFonte } from "@/lib/edital-itens";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Bloco VISÍVEL para quadro sem dado.
 *
 * ⚠️ Nunca um espaço em branco. Perda silenciosa é o formato de erro que este repo mais
 * teme — e um quadro que simplesmente não aparece é indistinguível de um que não existe.
 */
function QuadroPendente({ motivo }: { motivo: string }) {
  return (
    <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
      {motivo}
    </p>
  );
}

function QuadroDeCargosGerado({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const nome = (id: string) => cargos.find((c) => c.id === id)?.nome ?? "(cargo fora do catálogo)";

  if (cargosDoEdital.length === 0) {
    return <QuadroPendente motivo="Nenhum cargo no Quadro de Cargos — a tabela sairia vazia." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cargo</TableHead>
          <TableHead>Habilitação</TableHead>
          <TableHead className="text-right">Vagas</TableHead>
          <TableHead className="text-right">AC</TableHead>
          <TableHead className="text-right">PcD</TableHead>
          <TableHead className="text-right">Negros</TableHead>
          <TableHead className="text-right">Vencimento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cargosDoEdital.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{nome(c.cargo_id)}</TableCell>
            <TableCell className="text-xs">{c.habilitacao ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.vagas_total ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.vagas_ampla_concorrencia ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.vagas_pcd ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.vagas_negros ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {c.vencimento_base === null
                ? "—"
                : c.vencimento_base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MatrizGerada({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const { disciplinas } = useProvaObjetiva(cargosDoEdital.map((c) => c.id));
  const nome = (cargoId: string) => cargos.find((c) => c.id === cargoId)?.nome ?? "(cargo)";

  if (disciplinas.length === 0) {
    return <QuadroPendente motivo="Nenhuma disciplina na matriz da prova — a tabela sairia vazia." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cargo</TableHead>
          <TableHead>Disciplina</TableHead>
          <TableHead className="text-right">Questões</TableHead>
          <TableHead className="text-right">Peso por questão</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cargosDoEdital.flatMap((ec) =>
          disciplinas
            .filter((d) => d.edital_cargo_id === ec.id)
            .map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{nome(ec.cargo_id)}</TableCell>
                <TableCell>{d.nome_disciplina}</TableCell>
                <TableCell className="text-right tabular-nums">{d.quantidade_questoes}</TableCell>
                <TableCell className="text-right tabular-nums">{d.peso_por_questao}</TableCell>
              </TableRow>
            )),
        )}
      </TableBody>
    </Table>
  );
}

/**
 * Os Quadros III e IV do edital, gerados de `titulos_itens`.
 *
 * ⚠️ **UMA LINHA POR CARGO, e isso diverge do publicado por ESCOLHA.** O Quadro III do
 * Edital 002 junta os 8 cargos de Docente I numa linha só, com o rótulo "Docente I
 * (Arte, Ciências, …)". Perguntado em 2026-09-16, o usuário decidiu não agrupar: a
 * tabela gerada lista cargo a cargo. Não é descuido — está registrado no doc do módulo.
 *
 * As colunas reproduzem as do documento, inclusive as DUAS de pontuação.
 */
function QuadroDeTitulosGerado({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const { itens } = useTitulos(editalId, cargosDoEdital.map((c) => c.id));
  const nome = (cargoId: string) => cargos.find((c) => c.id === cargoId)?.nome ?? "(cargo)";

  if (itens.length === 0) {
    return <QuadroPendente motivo="Nenhum título parametrizado — a tabela sairia vazia." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cargos</TableHead>
          <TableHead>Títulos aferíveis</TableHead>
          <TableHead className="text-right">Pontuação mínima</TableHead>
          <TableHead className="text-right">Pontuação máxima</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cargosDoEdital.flatMap((ec) =>
          itens
            .filter((t) => t.edital_cargo_id === ec.id)
            .map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{nome(ec.cargo_id)}</TableCell>
                <TableCell>
                  {t.descricao}
                  {t.area_exigida && <> — <strong>{t.area_exigida}</strong></>}
                  {t.carga_horaria_minima_horas && <>, carga horária mínima de {t.carga_horaria_minima_horas} horas</>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.pontos_minimo}</TableCell>
                <TableCell className="text-right tabular-nums">{t.pontos_maximo}</TableCell>
              </TableRow>
            )),
        )}
      </TableBody>
    </Table>
  );
}

/**
 * O Quadro II do Edital 004: vagas de ACS por UBSF, geradas de `edital_cargo_unidades`.
 *
 * ⚠️ Uma linha por (cargo, unidade), como o documento — aqui NÃO há a divergência de
 * agrupamento dos outros dois quadros: o Quadro II publicado já é uma linha por unidade.
 */
function VagasPorAreaGerado({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const { unidades } = useUnidadesLotacao();
  const { distribuicao } = useTerritorialidade(editalId, cargosDoEdital.map((c) => c.id));
  const nomeCargo = (id: string) => cargos.find((c) => c.id === id)?.nome ?? "(cargo)";
  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? "(unidade)";

  if (distribuicao.length === 0) {
    return <QuadroPendente motivo="Nenhuma vaga distribuída por unidade — a tabela sairia vazia." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unidade</TableHead>
          <TableHead>Código da inscrição</TableHead>
          <TableHead className="text-right">Vagas AC</TableHead>
          <TableHead className="text-right">Vagas PD</TableHead>
          <TableHead className="text-right">Vagas CN</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cargosDoEdital.flatMap((ec) =>
          distribuicao
            .filter((v) => v.edital_cargo_id === ec.id)
            .map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">
                  {nomeUnidade(v.unidade_lotacao_id)}
                  {cargosDoEdital.length > 1 && (
                    <span className="text-muted-foreground"> — {nomeCargo(ec.cargo_id)}</span>
                  )}
                </TableCell>
                <TableCell>{v.codigo_inscricao ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{v.vagas_ampla_concorrencia}</TableCell>
                <TableCell className="text-right tabular-nums">{v.vagas_pcd || ""}</TableCell>
                <TableCell className="text-right tabular-nums">{v.vagas_negros || ""}</TableCell>
              </TableRow>
            )),
        )}
      </TableBody>
    </Table>
  );
}

function CronogramaGerado({ editalId }: { editalId: string }) {
  const { etapas } = useCronograma(editalId);

  if (etapas.length === 0) {
    return <QuadroPendente motivo="Cronograma sem nenhuma etapa — a tabela sairia vazia." />;
  }

  const formatar = (d: string) => {
    const [a, m, dia] = d.split("-").map(Number);
    return `${String(dia).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a} (${diaDaSemana(d)})`;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Etapa</TableHead>
          <TableHead>Data</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {etapas.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="font-medium">{e.nome_evento}</TableCell>
            <TableCell className="text-xs">
              {e.datas.length === 0 ? "— sem data" : e.datas.map(formatar).join(e.tipo === "INTERVALO" ? " a " : " ou ")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function QuadroDoArtigo({ fonte, editalId }: { fonte: QuadroFonte; editalId: string }) {
  if (fonte === "cargos") return <QuadroDeCargosGerado editalId={editalId} />;
  if (fonte === "disciplinas") return <MatrizGerada editalId={editalId} />;
  if (fonte === "cronograma") return <CronogramaGerado editalId={editalId} />;
  if (fonte === "titulos") return <QuadroDeTitulosGerado editalId={editalId} />;
  if (fonte === "vagas_por_area") return <VagasPorAreaGerado editalId={editalId} />;
  // 🔵 Não há mais fonte pendente: as cinco têm capítulo que as parametriza desde a
  // fatia 7. Este ramo só é alcançável se alguém acrescentar um valor ao domínio da CHECK
  // `chk_edital_item_quadro_fonte` e esquecer de renderizá-lo — e aí dizer isso na cara é
  // melhor que devolver `null`, que sairia como espaço em branco no documento.
  return <QuadroPendente motivo={`Fonte de quadro desconhecida: ${fonte}.`} />;
}

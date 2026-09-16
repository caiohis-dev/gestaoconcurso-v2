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
  // `titulos` (fatia 6) e `vagas_por_area` (fatia 7) ainda não têm capítulo que as
  // parametrize. O artigo pode ser escrito antes; o linter acusa até a fatia existir.
  return (
    <QuadroPendente
      motivo={
        fonte === "titulos"
          ? "Quadro de títulos — o capítulo que o parametriza ainda não existe (fatia 6)."
          : "Vagas por área de abrangência — o capítulo que as parametriza ainda não existe (fatia 7)."
      }
    />
  );
}

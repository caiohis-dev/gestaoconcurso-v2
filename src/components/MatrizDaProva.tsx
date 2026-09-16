/**
 * A matriz da prova objetiva — capítulo [12].
 *
 * 🔴 **O contador da soma é a peça central.** A soma das disciplinas tem de fechar com o
 * total declarado: prova publicada com soma errada é errata garantida. O aviso aparece
 * ao lado do contador, na hora, e não só ao salvar.
 *
 * ⚠️ A configuração é **por cargo** — os editais dizem "A Prova Objetiva para os
 * candidatos às vagas de <cargo> constará de…". Um edital com dois cargos tem duas
 * matrizes, e elas divergem de verdade (no 004, ACS e ACE têm composições diferentes).
 */
import { useState } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCargos } from "@/hooks/useCargos";
import { useProvaObjetiva, type ConfigGravada, type DisciplinaGravada } from "@/hooks/useProvaObjetiva";
import { conferirProva, somaDasQuestoes, minimoParaAprovacao } from "@/lib/edital-prova";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, AlertTriangle, CircleAlert } from "lucide-react";

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** Os quatro números da prova: total, duração e os dois tempos de sala. */
function CamposDaProva({
  config, cfg,
}: { config: ConfigGravada | null; cfg: (campos: Record<string, unknown>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <label className="text-sm">Total de questões
        <Input type="number" defaultValue={config?.total_questoes ?? ""} onBlur={(e) => cfg({ total_questoes: num(e.target.value) })} />
      </label>
      <label className="text-sm">Duração (min)
        <Input type="number" defaultValue={config?.duracao_minutos ?? ""} onBlur={(e) => cfg({ duracao_minutos: num(e.target.value) })} />
      </label>
      <label className="text-sm">Permanência mín. (min)
        <Input type="number" defaultValue={config?.tempo_minimo_permanencia_minutos ?? ""} onBlur={(e) => cfg({ tempo_minimo_permanencia_minutos: num(e.target.value) })} />
      </label>
      <label className="text-sm">Levar caderno após (min)
        <Input type="number" defaultValue={config?.tempo_minimo_levar_caderno_minutos ?? ""} onBlur={(e) => cfg({ tempo_minimo_levar_caderno_minutos: num(e.target.value) })} />
      </label>
    </div>
  );
}

/**
 * 🔴 O contador da soma. É a peça central do capítulo: soma que não fecha com o total
 * declarado é errata garantida na publicação.
 */
function ContadorDeQuestoes({
  soma, total, corte,
}: { soma: number; total: number | null; corte: number | null }) {
  const fechou = total === null || soma === total;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className={fechou ? "" : "font-medium text-destructive"}>
          {soma} / {total ?? "—"} questões definidas
        </span>
        {total !== null && corte !== null && (
          <span className="text-muted-foreground">
            aprovação a partir de {minimoParaAprovacao(total, corte)} acertos
          </span>
        )}
      </div>
      <Progress value={total ? Math.min(100, (soma / total) * 100) : 0} />
    </div>
  );
}

type Rascunho = { nome: string; qtd: string };

/**
 * A matriz de UM cargo. Extraída porque o `map` do componente pai passou de 15 de
 * complexidade — e porque o cargo é a unidade natural aqui: os editais configuram a prova
 * por cargo, não por edital.
 */
function MatrizDeUmCargo({
  nome, editalCargoId, config, disciplinas: ds, rascunho, setRascunho,
  salvarConfig, salvarDisciplina, removerDisciplina,
}: {
  nome: string;
  editalCargoId: string;
  config: ConfigGravada | null;
  disciplinas: DisciplinaGravada[];
  rascunho: Rascunho;
  setRascunho: (r: Rascunho) => void;
  salvarConfig: ReturnType<typeof useProvaObjetiva>["salvarConfig"];
  salvarDisciplina: ReturnType<typeof useProvaObjetiva>["salvarDisciplina"];
  removerDisciplina: ReturnType<typeof useProvaObjetiva>["removerDisciplina"];
}) {
  const soma = somaDasQuestoes(ds);
  const total = config?.total_questoes ?? null;
  const avisos = conferirProva({ config, disciplinas: ds });
  const cfg = (campos: Record<string, unknown>) =>
    salvarConfig({ ...config, edital_cargo_id: editalCargoId, ...campos });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{nome}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <CamposDaProva config={config} cfg={cfg} />

        <ContadorDeQuestoes soma={soma} total={total} corte={config?.nota_corte_percentual ?? null} />

        <ul className="space-y-1">
          {ds.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <Input className="flex-1" defaultValue={d.nome_disciplina}
                onBlur={(e) => salvarDisciplina({ ...d, nome_disciplina: e.target.value })} />
              <Input className="w-24" type="number" defaultValue={d.quantidade_questoes}
                onBlur={(e) => salvarDisciplina({ ...d, quantidade_questoes: Number(e.target.value) || 1 })} />
              <Button variant="ghost" size="icon" aria-label={`Remover ${d.nome_disciplina}`}
                onClick={() => removerDisciplina(d.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Input placeholder="Disciplina (ex.: Língua Portuguesa)" value={rascunho.nome}
            onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
          <Input className="w-24" type="number" placeholder="questões" value={rascunho.qtd}
            onChange={(e) => setRascunho({ ...rascunho, qtd: e.target.value })} />
          <Button className="gap-2" disabled={!rascunho.nome.trim() || !Number(rascunho.qtd)}
            onClick={() => {
              salvarDisciplina({
                edital_cargo_id: editalCargoId,
                nome_disciplina: rascunho.nome.trim(),
                quantidade_questoes: Number(rascunho.qtd),
                peso_por_questao: 1,
                ordem: ds.length,
              });
              setRascunho({ nome: "", qtd: "" });
            }}>
            <Plus className="h-4 w-4" />
            Acrescentar
          </Button>
        </div>

        {avisos.length > 0 && (
          <ul className="space-y-1 text-xs">
            {avisos.map((a, i) => (
              <li key={i} className={`flex items-start gap-1 ${a.severidade === "erro" ? "text-destructive" : "text-amber-700"}`}>
                {a.severidade === "erro"
                  ? <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                {a.mensagem}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function MatrizDaProva({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const ids = cargosDoEdital.map((c) => c.id);
  const { configs, disciplinas, isLoading, salvarConfig, salvarDisciplina, removerDisciplina } =
    useProvaObjetiva(ids);
  const [nova, setNova] = useState<Record<string, { nome: string; qtd: string }>>({});

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando a matriz…</p>;
  if (cargosDoEdital.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        A matriz é por cargo. Acrescente os cargos no capítulo <strong>Do Quadro de Cargos</strong> primeiro.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {cargosDoEdital.map((ec) => (
        <MatrizDeUmCargo
          key={ec.id}
          nome={cargos.find((c) => c.id === ec.cargo_id)?.nome ?? "(cargo removido)"}
          editalCargoId={ec.id}
          config={configs.find((c) => c.edital_cargo_id === ec.id) ?? null}
          disciplinas={disciplinas.filter((d) => d.edital_cargo_id === ec.id)}
          rascunho={nova[ec.id] ?? { nome: "", qtd: "" }}
          setRascunho={(r) => setNova({ ...nova, [ec.id]: r })}
          salvarConfig={salvarConfig}
          salvarDisciplina={salvarDisciplina}
          removerDisciplina={removerDisciplina}
        />
      ))}
    </div>
  );
}

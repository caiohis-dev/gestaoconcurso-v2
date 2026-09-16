/**
 * O cronograma do certame — segundo capítulo com parâmetro estruturado.
 *
 * 🎯 **É aqui que o `"dia XX/xx/2026"` do Edital 004 deixa de ser possível.** Enquanto a
 * data é texto corrido, "vazio" não é estado. Vinda de um campo, etapa sem data aparece
 * no painel de pendências antes de alguém publicar.
 *
 * 🔴 **Três formas de data, e isso foi medido no cronograma real:** data única, intervalo
 * ("29/06 a 27/07") e ALTERNATIVAS ("06/07, 09/07, 13/07, 16/07 ou 20/07"). Espremer as
 * alternativas num intervalo publicaria um edital falso — os dias do meio não são
 * oferecidos. Ver `src/lib/edital-cronograma.ts`.
 */
import { useState } from "react";
import { useCronograma, type EtapaGravada } from "@/hooks/useCronograma";
import {
  conferirCronograma,
  ETAPAS_SUGERIDAS,
  type TipoDeData,
} from "@/lib/edital-cronograma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, AlertTriangle, CircleAlert } from "lucide-react";

const ROTULO: Record<TipoDeData, string> = {
  DATA_UNICA: "Data única",
  INTERVALO: "Intervalo",
  ALTERNATIVAS: "Datas alternativas",
};

/** `2026-06-29, 2026-07-27` → `["2026-06-29","2026-07-27"]`. Vazio devolve lista vazia. */
function lerDatas(texto: string): string[] {
  return texto
    .split(/[,;\s]+/)
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
}

export function CronogramaEtapas({ editalId }: { editalId: string }) {
  const { etapas, isLoading, salvar, isSalvando, remover } = useCronograma(editalId);
  const [novaChave, setNovaChave] = useState("");

  const avisos = conferirCronograma(etapas);
  const avisosDa = (chave: string | null) => avisos.filter((a) => a.chave === chave);

  const jaTem = new Set(etapas.map((e) => e.chave));
  const disponiveis = ETAPAS_SUGERIDAS.filter((e) => !jaTem.has(e.chave));

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando o cronograma…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Acrescentar etapa</label>
          <Select value={novaChave} onValueChange={setNovaChave}>
            <SelectTrigger>
              <SelectValue placeholder={disponiveis.length ? "Selecione uma etapa" : "Todas as etapas sugeridas já estão no cronograma"} />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((e) => (
                <SelectItem key={e.chave} value={e.chave}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="gap-2"
          disabled={!novaChave || isSalvando}
          onClick={() => {
            const s = ETAPAS_SUGERIDAS.find((e) => e.chave === novaChave)!;
            salvar({ chave: s.chave, nome_evento: s.nome, tipo: s.tipo, datas: [], ordem: etapas.length });
            setNovaChave("");
          }}
        >
          <Plus className="h-4 w-4" />
          Acrescentar
        </Button>
      </div>

      {etapas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Cronograma vazio. As etapas sugeridas vêm do cronograma real dos editais da FEVRE —
          e você pode acrescentar etapa própria depois.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Etapa</TableHead>
                <TableHead className="w-44">Forma</TableHead>
                <TableHead>Datas</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {etapas.map((e: EtapaGravada) => {
                const problemas = avisosDa(e.chave);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.nome_evento}</TableCell>
                    <TableCell>
                      <Select value={e.tipo} onValueChange={(tipo) => salvar({ ...e, tipo: tipo as TipoDeData })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROTULO) as TipoDeData[]).map((t) => (
                            <SelectItem key={t} value={t}>{ROTULO[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={e.datas.join(", ")}
                        placeholder={
                          e.tipo === "INTERVALO" ? "2026-06-29, 2026-07-27"
                          : e.tipo === "ALTERNATIVAS" ? "2026-07-06, 2026-07-09, 2026-07-13"
                          : "2026-09-20"
                        }
                        onBlur={(ev) => salvar({ ...e, datas: lerDatas(ev.target.value) })}
                        aria-label={`Datas de ${e.nome_evento}`}
                      />
                      {problemas.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs">
                          {problemas.map((p, i) => (
                            <li key={i} className={`flex items-start gap-1 ${p.severidade === "erro" ? "text-destructive" : "text-amber-700"}`}>
                              {p.severidade === "erro"
                                ? <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                                : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                              {p.mensagem}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" aria-label={`Remover ${e.nome_evento}`} onClick={() => remover(e.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Datas em <code>AAAA-MM-DD</code>, separadas por vírgula. <strong>Intervalo</strong> pede duas;{" "}
        <strong>datas alternativas</strong> lista os dias específicos oferecidos — e não é a mesma coisa
        que um intervalo, porque os dias do meio não valem.
      </p>
    </div>
  );
}

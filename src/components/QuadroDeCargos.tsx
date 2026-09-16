/**
 * O Quadro I do edital — cargos, vagas, remuneração.
 *
 * 🔴 **Este é o primeiro capítulo com PARÂMETRO ESTRUTURADO**, e inaugura o padrão que as
 * fatias seguintes vão repetir: o capítulo deixa de ser texto livre e passa a ser
 * formulário; o texto do edital é GERADO a partir dele.
 *
 * Duas coisas que não são detalhe:
 *
 * 1. **Quem preenche digita o TOTAL de vagas**, e o sistema propõe AC/PCD/CN. Foi assim
 *    que a medição mostrou que os editais fazem — ver `src/lib/edital-cotas.ts`, cuja
 *    regra saiu de 22 valores reais. Inverter (pedir o AC) daria números errados em cargo
 *    grande: no Técnico em Enfermagem daria 11 de PCD onde o edital publica 16.
 *
 * 2. **A trava de conselho de classe** é o primeiro anteparo ao erro do Edital 004, que
 *    exigiu "Certidão Nada Consta do COREN" de Agente Comunitário de Saúde. Aqui ela é
 *    conveniência; o anteparo de verdade é a fatia 8, no checklist de investidura.
 */
import { useState } from "react";
import { useCargos } from "@/hooks/useCargos";
import { useEditalCargos, type EditalCargo } from "@/hooks/useEditalCargos";
import { sugerirCotas, conferirCotas } from "@/lib/edital-cotas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

/** Conselhos que a fatia 8 conhece. `NENHUM` é afirmação, diferente de não preenchido. */
const CONSELHOS = ["NENHUM", "COREN", "CRM", "CREF", "OAB", "CRO", "CRF", "CRP", "CRN", "CREA", "CRC", "CRESS", "CRMV", "CRB", "CRFa"] as const;

function numeroOuNulo(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function QuadroDeCargos({ editalId }: { editalId: string }) {
  const { cargos } = useCargos();
  const { cargosDoEdital, isLoading, salvar, isSalvando, remover } = useEditalCargos(editalId);
  const [novoCargoId, setNovoCargoId] = useState("");

  const nomeDoCargo = (id: string) => cargos.find((c) => c.id === id)?.nome ?? "(cargo removido do catálogo)";
  const jaNoQuadro = new Set(cargosDoEdital.map((c) => c.cargo_id));
  const disponiveis = cargos.filter((c) => !jaNoQuadro.has(c.id));

  /**
   * Mudar o TOTAL recalcula a sugestão das três colunas. ⚠️ Sobrescreve o que o usuário
   * tenha editado à mão — é o comportamento certo: ele acabou de mudar a base do cálculo.
   * Editar AC/PCD/CN depois disso não mexe no total.
   */
  const aoMudarTotal = (linha: EditalCargo, valor: string) => {
    const total = numeroOuNulo(valor);
    if (total === null) {
      salvar({ ...linha, vagas_total: null });
      return;
    }
    const s = sugerirCotas(total);
    salvar({
      ...linha,
      vagas_total: s.total,
      vagas_ampla_concorrencia: s.amplaConcorrencia,
      vagas_pcd: s.pcd,
      vagas_negros: s.negros,
    });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando o quadro…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Acrescentar cargo do catálogo</label>
          <Select value={novoCargoId} onValueChange={setNovoCargoId}>
            <SelectTrigger>
              <SelectValue placeholder={disponiveis.length ? "Selecione um cargo" : "Todos os cargos do catálogo já estão no quadro"} />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="gap-2"
          disabled={!novoCargoId || isSalvando}
          onClick={() => {
            salvar({ cargo_id: novoCargoId });
            setNovoCargoId("");
          }}
        >
          <Plus className="h-4 w-4" />
          Acrescentar
        </Button>
      </div>

      {cargosDoEdital.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum cargo no Quadro I. O catálogo de cargos é o mesmo do módulo Candidatos —
          cargo novo se cadastra em <strong>Candidatos → Cargos</strong>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cargo</TableHead>
                <TableHead className="w-24">Código</TableHead>
                <TableHead className="w-20">Total</TableHead>
                <TableHead className="w-16">AC</TableHead>
                <TableHead className="w-16">PCD</TableHead>
                <TableHead className="w-16">CN</TableHead>
                <TableHead className="w-28">Vencimento</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargosDoEdital.map((linha) => {
                const avisos = linha.vagas_total === null ? [] : conferirCotas({
                  total: Number(linha.vagas_total),
                  amplaConcorrencia: Number(linha.vagas_ampla_concorrencia ?? 0),
                  pcd: Number(linha.vagas_pcd ?? 0),
                  negros: Number(linha.vagas_negros ?? 0),
                });
                return (
                  <TableRow key={linha.id}>
                    <TableCell className="font-medium">{nomeDoCargo(linha.cargo_id)}</TableCell>
                    <TableCell>
                      <Input
                        defaultValue={linha.codigo_inscricao ?? ""}
                        placeholder="MT 22"
                        onBlur={(e) => salvar({ ...linha, codigo_inscricao: e.target.value || null })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={linha.vagas_total ?? ""}
                        onBlur={(e) => aoMudarTotal(linha, e.target.value)}
                        aria-label={`Total de vagas de ${nomeDoCargo(linha.cargo_id)}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} defaultValue={linha.vagas_ampla_concorrencia ?? ""}
                        onBlur={(e) => salvar({ ...linha, vagas_ampla_concorrencia: numeroOuNulo(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} defaultValue={linha.vagas_pcd ?? ""}
                        onBlur={(e) => salvar({ ...linha, vagas_pcd: numeroOuNulo(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} defaultValue={linha.vagas_negros ?? ""}
                        onBlur={(e) => salvar({ ...linha, vagas_negros: numeroOuNulo(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" min={0} defaultValue={linha.vencimento_base ?? ""}
                        onBlur={(e) => salvar({ ...linha, vencimento_base: numeroOuNulo(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" aria-label={`Remover ${nomeDoCargo(linha.cargo_id)} do quadro`}
                        onClick={() => remover(linha.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                    {avisos.length > 0 && (
                      <TableCell colSpan={8} className="pt-0">
                        <ul className="space-y-0.5 text-xs text-amber-700">
                          {avisos.map((a, i) => (
                            <li key={i} className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {a.mensagem}
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Digite o <strong>total</strong> de vagas: o sistema propõe 10% de PCD e 20% de cotas raciais,
        com arredondamento comum — a regra medida nos Editais 002 e 003. Você pode sobrescrever
        qualquer coluna; a soma tem de fechar com o total.
      </p>
    </div>
  );
}

export { CONSELHOS };

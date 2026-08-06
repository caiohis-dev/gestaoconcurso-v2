import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useProvaUnidades } from "@/hooks/useProvaUnidades";
import { useSalasDistribuidas } from "@/hooks/useSalasDistribuidas";
import { useOcupacaoPorSala, useIncluirNaSala } from "@/hooks/useAlocacaoCandidatos";
import { agruparSalasComVagaPorUnidade } from "@/lib/alocacao-candidatos";

/**
 * Escolher a SALA para uma pessoa — o sentido inverso do diálogo "Ver sala", que parte da
 * sala e procura a pessoa.
 *
 * 🔴 POR QUE OS DOIS EXISTEM. Eles respondem a perguntas diferentes: "onde ponho esta
 * pessoa?" e "quem está nesta sala?". Este aqui é o que serve a quem tem um PEDIDO na mão
 * ("sala térrea e ledor") e precisa achar uma sala que o atenda — com 231 salas em 7
 * unidades, obrigar a adivinhar a sala antes de procurar a pessoa é o caminho longo.
 *
 * ⚠️ Ele saiu da tela em 2026-08-05, junto com o botão "Incluir em sala" da seção antiga,
 * e voltou no mesmo dia: remover o botão não devia ter removido a capacidade.
 *
 * ⚠️ Busca o que precisa por hooks PRÓPRIOS em vez de receber por prop. O React Query
 * deduplica pelas mesmas chaves que a página já usa, então não custa consulta nova — e o
 * componente deixa de depender de a página lembrar de passar quatro props coerentes.
 */
export function IncluirEmSalaDialog({
  provaId,
  candidatoId,
  nome,
  salaEspecial,
  portadorDeficiencia,
  onClose,
}: {
  provaId: string;
  candidatoId: string;
  nome: string;
  salaEspecial: string | null;
  portadorDeficiencia: boolean;
  onClose: () => void;
}) {
  const { salas } = useSalasDistribuidas(provaId);
  const { provaUnidades } = useProvaUnidades(provaId);
  const { ocupacao } = useOcupacaoPorSala(provaId);
  const { incluir, isIncluindo } = useIncluirNaSala();
  const [salaId, setSalaId] = useState<string>("");

  /**
   * As salas com vaga, AGRUPADAS por unidade e em ordem física.
   *
   * 🔴 A ordem das unidades é por **`unid_nome`**, não por sigla, e a diferença é
   * visível: por nome, "UGB — CENTRO UNIV. GERALDO DI BIASE" vem primeiro; por sigla
   * viria quase no fim. `unid_nome` é a chave que o BANCO usa para ordem física, e usar
   * outra aqui criaria uma terceira ordenação para o mesmo conceito.
   *
   * ⚠️ O rótulo do grupo mostra sigla E nome de propósito: só a sigla faria a sequência
   * parecer arbitrária, já que ela não é a chave da ordenação.
   *
   * Dentro da unidade: `sala_andar` (nulos por último) e depois `sala_numero` — a mesma
   * ordem que `aplicar_plano_de_alocacao` percorre.
   *
   * Só salas com vaga: oferecer uma cheia seria oferecer um AL006 (a recusa do banco).
   */
  const gruposDeSalas = useMemo(
    () =>
      agruparSalasComVagaPorUnidade(
        salas,
        provaUnidades.map((pu) => ({
          unidade_id: pu.unidade_id,
          sigla: pu.unidades_prova.unid_sigla,
          nome: pu.unidades_prova.unid_nome,
        })),
        ocupacao,
      ),
    [salas, provaUnidades, ocupacao],
  );

  const temVaga = gruposDeSalas.length > 0;

  const pedido =
    [
      portadorDeficiencia ? "PCD" : null,
      salaEspecial?.trim() ? salaEspecial : null,
    ]
      .filter(Boolean)
      .join(" · ") || "(sem texto)";

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Incluir {nome} em uma sala</DialogTitle>
          {/* O pedido fica À VISTA aqui de propósito: é a informação que decide a sala, e
              obrigar a memorizá-la antes de abrir o diálogo é o vaivém que este
              componente existe para evitar. */}
          <DialogDescription>
            O pedido do inscrito: {pedido}. A lista abaixo traz só salas com vaga nesta
            prova; quem decide se a sala atende ao pedido é você.
          </DialogDescription>
        </DialogHeader>

        {!temVaga ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma sala com vaga nesta prova. Aumente capacidades ou vincule mais unidades.
          </p>
        ) : (
          <Select value={salaId} onValueChange={setSalaId}>
            <SelectTrigger aria-label="Sala de destino">
              <SelectValue placeholder="Escolha a sala" />
            </SelectTrigger>
            <SelectContent className="max-h-[22rem]">
              {gruposDeSalas.map((grupo) => (
                <SelectGroup key={grupo.unidadeId}>
                  <SelectLabel>
                    {grupo.sigla} — {grupo.nome}
                  </SelectLabel>
                  {grupo.salas.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Sala {s.sala_numero}
                      {s.sala_andar != null ? ` · andar ${s.sala_andar}` : ""} —{" "}
                      {ocupacao[s.id] ?? 0} / {s.sala_capacidade}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!salaId || isIncluindo}
            onClick={async () => {
              await incluir({ candidatoId, salaId, provaId });
              onClose();
            }}
          >
            {isIncluindo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Incluir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

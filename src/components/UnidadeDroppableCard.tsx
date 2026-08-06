import { useDroppable } from "@dnd-kit/core";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlocacaoDraggableBadge } from "./AlocacaoDraggableBadge";
import {
  DadosSoltaveis,
  simularEmpacotamento,
  totalAlocado,
  UnidadeAlocavel,
  vagasTotais,
} from "@/lib/alocacao-dnd";

/** Reexportado porque os componentes irmãos já importavam o tipo daqui. */
export type { AlocacaoUnidade } from "@/lib/alocacao-dnd";

/** A unidade que recebe blocos de cargo. Os blocos dentro dela são arrastáveis de volta. */
export function UnidadeDroppableCard({ unidade }: { unidade: UnidadeAlocavel }) {
  const dados: DadosSoltaveis = { tipo: "unidade", unidadeId: unidade.id };

  const { isOver, setNodeRef } = useDroppable({ id: `unid-${unidade.id}`, data: dados });

  const capacidade = vagasTotais(unidade);
  const alocados = totalAlocado(unidade);
  const { vagasUteis, ociosas } = simularEmpacotamento(unidade);
  const cheio = vagasUteis === 0;
  // `vagasTotais` zerada existe no mock e existiria no real: sem a guarda, 0/0 vira NaN
  // e a barra some sem explicação.
  const percentual = capacidade > 0 ? Math.min(100, (alocados / capacidade) * 100) : 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-3 p-4 rounded-lg border-2 transition-all min-h-[8rem]",
        isOver && !cheio && "border-primary bg-primary/5 scale-[1.02]",
        isOver && cheio && "border-red-500 bg-red-50",
        !isOver && "border-border bg-card",
        cheio && !isOver && "opacity-80 bg-muted",
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Building2 className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="truncate" title={unidade.nome}>
          {unidade.nome}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Ocupação</span>
          <span>
            {alocados} / {capacidade}
          </span>
        </div>
        {/* 🔴 A ociosidade fica À VISTA. "Cada bloco abre sala nova" gasta capacidade que
            não aparece em `alocados / capacidade` — e foi essa diferença invisível que
            deixou montar um plano recusado com AL004 depois de tudo pronto. */}
        {ociosas > 0 && (
          <p className="text-xs text-muted-foreground">
            {vagasUteis} vaga(s) úteis · {ociosas} ociosa(s) em salas de fronteira
          </p>
        )}
        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300", cheio ? "bg-red-500" : "bg-primary")}
            style={{ width: `${percentual}%` }}
          />
        </div>
      </div>

      {unidade.alocacoesPorCargo.length > 0 && (
        <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-border">
          {unidade.alocacoesPorCargo.map((aloc) => (
            <AlocacaoDraggableBadge
              key={aloc.blocoId}
              unidadeId={unidade.id}
              blocoId={aloc.blocoId}
              nome={aloc.nome}
              bloco={aloc.bloco}
              quantidade={aloc.quantidade}
            />
          ))}
        </div>
      )}
    </div>
  );
}

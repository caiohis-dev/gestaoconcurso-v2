import { useDroppable } from "@dnd-kit/core";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlocacaoDraggableBadge } from "./AlocacaoDraggableBadge";
import { DadosSoltaveis, UnidadeAlocavel, vagasRestantes } from "@/lib/alocacao-dnd";

/** Reexportado porque os componentes irmãos já importavam o tipo daqui. */
export type { AlocacaoUnidade } from "@/lib/alocacao-dnd";

/** A unidade que recebe blocos de cargo. Os blocos dentro dela são arrastáveis de volta. */
export function UnidadeDroppableCard({ unidade }: { unidade: UnidadeAlocavel }) {
  const dados: DadosSoltaveis = { tipo: "unidade", unidadeId: unidade.id };

  const { isOver, setNodeRef } = useDroppable({ id: `unid-${unidade.id}`, data: dados });

  const cheio = vagasRestantes(unidade) === 0;
  // `vagasTotais` zerada existe no mock e existiria no real: sem a guarda, 0/0 vira NaN
  // e a barra some sem explicação.
  const percentual =
    unidade.vagasTotais > 0
      ? Math.min(100, (unidade.alocados / unidade.vagasTotais) * 100)
      : 0;

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
            {unidade.alocados} / {unidade.vagasTotais}
          </span>
        </div>
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
              key={aloc.cargoId}
              unidadeId={unidade.id}
              cargoId={aloc.cargoId}
              nome={aloc.nome}
              quantidade={aloc.quantidade}
            />
          ))}
        </div>
      )}
    </div>
  );
}

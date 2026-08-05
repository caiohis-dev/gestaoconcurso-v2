import { useDraggable } from "@dnd-kit/core";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { DadosArrastaveis } from "@/lib/alocacao-dnd";

interface AlocacaoBadgeProps {
  nome: string;
  quantidade: number;
  comoOverlay?: boolean;
  arrastando?: boolean;
}

/** O visual do bloco alocado, SEM hook — mesma razão de `CargoCard`: o clone do overlay. */
export function AlocacaoBadge({ nome, quantidade, comoOverlay, arrastando }: AlocacaoBadgeProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 p-2 rounded border shadow-sm w-full touch-none transition-colors",
        "bg-blue-50 border-blue-200 text-blue-900 cursor-grab active:cursor-grabbing hover:bg-blue-100",
        arrastando && !comoOverlay && "opacity-0",
        comoOverlay && "shadow-lg cursor-grabbing w-44",
      )}
    >
      <span className="font-semibold text-xs truncate" title={nome}>
        {nome}
      </span>
      <div className="flex items-center gap-1 text-[10px]">
        <Users className="h-3 w-3" aria-hidden="true" />
        <span>{quantidade} alocados</span>
      </div>
    </div>
  );
}

interface AlocacaoDraggableBadgeProps {
  unidadeId: string;
  cargoId: string;
  nome: string;
  quantidade: number;
}

/**
 * O bloco de um cargo dentro de uma unidade — arrastável de volta para os pendentes.
 *
 * Ele mora DENTRO do droppable da unidade. É por isso que a detecção de colisão do
 * `AlocacaoDragDropUI` é `pointerWithin`: com `closestCenter`, o card da unidade que o
 * contém disputa cada movimento e o retorno vira sorte.
 */
export function AlocacaoDraggableBadge({
  unidadeId,
  cargoId,
  nome,
  quantidade,
}: AlocacaoDraggableBadgeProps) {
  const dados: DadosArrastaveis = { tipo: "alocado", unidadeId, cargoId, nome, quantidade };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `alocado-${unidadeId}-${cargoId}`,
    data: dados,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`${nome}, ${quantidade} alocados — arraste para devolver aos pendentes`}
    >
      <AlocacaoBadge nome={nome} quantidade={quantidade} arrastando={isDragging} />
    </div>
  );
}

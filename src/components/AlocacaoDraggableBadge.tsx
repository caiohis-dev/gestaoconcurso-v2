import { useDraggable } from "@dnd-kit/core";
import { Users, Accessibility } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlocoCargo, DadosArrastaveis, ROTULO_DO_BLOCO } from "@/lib/alocacao-dnd";

interface AlocacaoBadgeProps {
  nome: string;
  quantidade: number;
  bloco?: BlocoCargo;
  comoOverlay?: boolean;
  arrastando?: boolean;
}

/** O visual do bloco alocado, SEM hook — mesma razão de `CargoCard`: o clone do overlay. */
const COR_DO_BLOCO: Record<BlocoCargo, string> = {
  comum: "bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100",
  pcd: "bg-violet-50 border-violet-300 text-violet-900 hover:bg-violet-100",
  sala_especial: "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100",
};

export function AlocacaoBadge({
  nome,
  quantidade,
  bloco = "comum",
  comoOverlay,
  arrastando,
}: AlocacaoBadgeProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 p-2 rounded border shadow-sm w-full touch-none transition-colors",
        "cursor-grab active:cursor-grabbing",
        // Mesma cor do card de origem: o bloco tem de ser reconhecível depois de solto,
        // senão a sala própria dele vira surpresa no relatório.
        COR_DO_BLOCO[bloco],
        arrastando && !comoOverlay && "opacity-0",
        comoOverlay && "shadow-lg cursor-grabbing w-44",
      )}
    >
      <span className="font-semibold text-xs truncate" title={nome}>
        {nome}
      </span>
      <div className="flex items-center gap-1 text-[10px]">
        {bloco === "comum" ? (
          <Users className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Accessibility className="h-3 w-3" aria-hidden="true" />
        )}
        {/* O rótulo do bloco vem SEMPRE, inclusive no comum: fora do container do cargo
            não há outro sinal de qual dos três estoques este bloco é. */}
        <span>
          {ROTULO_DO_BLOCO[bloco]} · {quantidade.toLocaleString("pt-BR")}
        </span>
      </div>
    </div>
  );
}

interface AlocacaoDraggableBadgeProps {
  unidadeId: string;
  /** O id do BLOCO (cargo + comum/especial). */
  blocoId: string;
  nome: string;
  bloco: BlocoCargo;
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
  blocoId,
  nome,
  bloco,
  quantidade,
}: AlocacaoDraggableBadgeProps) {
  const dados: DadosArrastaveis = {
    tipo: "alocado",
    unidadeId,
    blocoId,
    nome,
    bloco,
    quantidade,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `alocado-${unidadeId}-${blocoId}`,
    data: dados,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`${nome}${bloco === "comum" ? "" : ` — ${ROTULO_DO_BLOCO[bloco]}`}, ${quantidade} alocados — arraste para devolver aos pendentes`}
    >
      <AlocacaoBadge nome={nome} quantidade={quantidade} bloco={bloco} arrastando={isDragging} />
    </div>
  );
}

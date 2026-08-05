import { useDraggable } from "@dnd-kit/core";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { DadosArrastaveis } from "@/lib/alocacao-dnd";

interface CargoCardProps {
  nome: string;
  naoAlocados: number;
  /** Só o clone do `DragOverlay` passa isto: some a opacidade que esconde a origem. */
  comoOverlay?: boolean;
  arrastando?: boolean;
}

/**
 * O visual do card de cargo, SEM hook nenhum.
 *
 * ⚠️ A separação não é estética: o `DragOverlay` renderiza um clone deste card, e se o
 * clone também chamasse `useDraggable` haveria DOIS draggables com o mesmo `id`
 * registrados. O dnd-kit guarda os nós num Map por id — o clone sobrescreveria o nó de
 * origem. Componente visual puro + wrapper arrastável resolve na raiz.
 */
export function CargoCard({ nome, naoAlocados, comoOverlay, arrastando }: CargoCardProps) {
  const isZerado = naoAlocados === 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-3 rounded-md border shadow-sm touch-none transition-colors w-44 flex-shrink-0",
        isZerado
          ? "bg-blue-50 border-blue-200 text-blue-900 cursor-default"
          : "bg-red-50 border-red-200 text-red-900 cursor-grab active:cursor-grabbing hover:bg-red-100",
        arrastando && !comoOverlay && "opacity-0",
        comoOverlay && "shadow-lg cursor-grabbing",
      )}
    >
      <span className="font-semibold text-sm line-clamp-2 min-h-[2.5rem]" title={nome}>
        {nome}
      </span>
      <div className="flex items-center gap-1 text-xs">
        <Users className="h-3 w-3" aria-hidden="true" />
        <span>{naoAlocados} pendentes</span>
      </div>
    </div>
  );
}

interface CargoDraggableCardProps {
  id: string;
  nome: string;
  naoAlocados: number;
}

/** O card de cargo pendente, arrastável para uma unidade. */
export function CargoDraggableCard({ id, nome, naoAlocados }: CargoDraggableCardProps) {
  const dados: DadosArrastaveis = { tipo: "cargo", cargoId: id, nome, naoAlocados };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cargo-${id}`,
    data: dados,
    disabled: naoAlocados === 0,
  });

  // Sem `transform` no nó de origem: quem se move é o clone do DragOverlay. Aplicar os
  // dois soma deslocamentos e faz a origem invisível empurrar a área de rolagem.
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} aria-label={`Cargo ${nome}, ${naoAlocados} pendentes`}>
      <CargoCard nome={nome} naoAlocados={naoAlocados} arrastando={isDragging} />
    </div>
  );
}

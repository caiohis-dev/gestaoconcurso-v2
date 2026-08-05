import { useDroppable } from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CargoDraggableCard } from "./CargoDraggableCard";
import { CargoPendente, DadosSoltaveis, ID_PENDENTES } from "@/lib/alocacao-dnd";

/**
 * A faixa de cargos pendentes — é droppable: arrastar um bloco alocado para cá o devolve.
 *
 * 🔴 ESTE COMPONENTE EXISTE POR UMA RAZÃO ESPECÍFICA, não por organização.
 *
 * Antes, o `useDroppable({ id: 'cargos-pendentes' })` era chamado dentro do MESMO
 * componente que renderiza o `<DndContext>`. Contexto React só alcança descendentes, e o
 * `useDroppable` lê `InternalContext` — fora do provider ele pega o `defaultInternalContext`,
 * cujo `dispatch` é `noop`. Resultado: o droppable nunca era registrado, `over` nunca
 * valia 'cargos-pendentes' e devolver um cargo era IMPOSSÍVEL — sem erro, sem aviso no
 * console. Os cards de unidade funcionavam porque são componentes-filhos, dentro do
 * provider. Extrair este card para cá é o que conserta.
 *
 * ⚠️ Não devolva este `useDroppable` para o componente-pai. O sintoma volta calado.
 */
export function CargosPendentesDropzone({ cargos }: { cargos: CargoPendente[] }) {
  const dados: DadosSoltaveis = { tipo: ID_PENDENTES };

  const { setNodeRef, isOver } = useDroppable({ id: ID_PENDENTES, data: dados });

  const pendentes = cargos.filter((c) => c.naoAlocados > 0);

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "transition-colors",
        isOver ? "bg-primary/5 border-primary" : "bg-muted/30",
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
          1. Cargos pendentes (arraste para uma unidade — ou de volta para cá)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 pb-4 pt-1 px-1 min-h-[6rem]">
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground self-center">
              Nenhum cargo pendente. Arraste um bloco de dentro de uma unidade para devolvê-lo
              para cá.
            </p>
          ) : (
            pendentes.map((cargo) => (
              <CargoDraggableCard
                key={cargo.id}
                id={cargo.id}
                nome={cargo.nome}
                naoAlocados={cargo.naoAlocados}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

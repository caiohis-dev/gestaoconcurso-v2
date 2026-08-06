import { useDroppable } from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CargoDraggableCard } from "./CargoDraggableCard";
import { agruparPorCargo, CargoPendente, DadosSoltaveis, ID_PENDENTES } from "@/lib/alocacao-dnd";

/**
 * A faixa de cargos a distribuir: um CONTAINER por cargo, com os três blocos dentro.
 *
 * A faixa inteira é droppable — arrastar um bloco alocado para cá o devolve, e ele volta
 * para o container do cargo dele.
 *
 * 🔴 ESTE COMPONENTE EXISTE POR UMA RAZÃO ESPECÍFICA, não por organização.
 *
 * Antes, o `useDroppable({ id: 'cargos-pendentes' })` era chamado dentro do MESMO
 * componente que renderiza o `<DndContext>`. Contexto React só alcança descendentes, e o
 * `useDroppable` lê `InternalContext` — fora do provider ele pega o
 * `defaultInternalContext`, cujo `dispatch` é `noop`. Resultado: o droppable nunca era
 * registrado, `over` nunca valia 'cargos-pendentes' e devolver um bloco era IMPOSSÍVEL —
 * sem erro, sem aviso no console. Os cards de unidade funcionavam porque são
 * componentes-filhos, dentro do provider. Extrair este card para cá é o que conserta.
 *
 * ⚠️ Não devolva este `useDroppable` para o componente-pai. O sintoma volta calado.
 */
export function CargosPendentesDropzone({ cargos }: { cargos: CargoPendente[] }) {
  const dados: DadosSoltaveis = { tipo: ID_PENDENTES };

  const { setNodeRef, isOver } = useDroppable({ id: ID_PENDENTES, data: dados });

  // ⚠️ Nada de filtrar bloco zerado: o card vazio é INFORMAÇÃO ("sem inscritos"), e o
  // container só faz sentido mostrando sempre os três.
  const grupos = agruparPorCargo(cargos);

  return (
    <Card
      ref={setNodeRef}
      className={cn("transition-colors", isOver ? "bg-primary/5 border-primary" : "bg-muted/30")}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
          1. Cargos a distribuir (arraste um bloco para uma unidade — ou de volta para cá)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum cargo com inscritos neste edital.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {grupos.map((grupo) => (
              <div
                key={grupo.chave}
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm"
              >
                <p
                  className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.25rem]"
                  title={grupo.nome}
                >
                  {grupo.nome}
                </p>
                <div className="flex flex-col gap-1.5">
                  {grupo.blocos.map((b) => (
                    <CargoDraggableCard
                      key={b.id}
                      id={b.id}
                      nome={b.nome}
                      bloco={b.bloco}
                      naoAlocados={b.naoAlocados}
                      total={b.total}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

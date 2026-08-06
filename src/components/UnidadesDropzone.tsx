import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnidadeDroppableCard } from "./UnidadeDroppableCard";
import { UnidadeAlocavel } from "@/lib/alocacao-dnd";

/**
 * O container das unidades — a metade DIREITA do quadro de planejamento.
 *
 * ⚠️ Este container é PRESENTACIONAL: quem recebe o arrasto é cada `UnidadeDroppableCard`
 * lá dentro, nunca ele. Um droppable no container inteiro seria ambíguo (soltar "nas
 * unidades" não diz em qual) e ainda disputaria a colisão com os cards que ele envolve —
 * exatamente o problema de aninhamento que fez a detecção virar `pointerWithin`.
 */
export function UnidadesDropzone({ unidades }: { unidades: UnidadeAlocavel[] }) {
  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
          2. Unidades (solte um bloco aqui)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {unidades.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Esta prova não tem unidades vinculadas. Vincule-as em Gerenciar Prova antes de
            planejar.
          </p>
        ) : (
          // Uma coluna até `xl`: o container ocupa metade da tela, e dois cards lado a
          // lado só param de espremer o nome da unidade em telas largas.
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {unidades.map((unidade) => (
              <UnidadeDroppableCard key={unidade.id} unidade={unidade} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

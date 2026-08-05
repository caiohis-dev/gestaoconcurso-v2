import { useNavigate } from "react-router-dom";
import { useProvas } from "@/hooks/useProvas";
import { useContagemCandidatosPorEdital } from "@/hooks/useCandidatos";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, DoorOpen, Users } from "lucide-react";

/** Data ISO → dd/mm/aaaa, sem `new Date` (que leria 'YYYY-MM-DD' como UTC e voltaria um dia). */
function dataLegivel(iso: string | null): string | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split("T")[0].split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : null;
}

/**
 * A porta do módulo: escolher a PROVA cuja alocação se vai trabalhar.
 *
 * A alocação é por prova (as salas são o snapshot `salas_prova_distribuidas`), então o
 * card diz o que a pessoa precisa para escolher: o edital, a data e quantos inscritos o
 * edital tem — o número que a distribuição vai tentar acomodar.
 */
export default function AlocacaoCandidatos() {
  const navigate = useNavigate();
  const { provas, isLoading } = useProvas();
  const { contagem } = useContagemCandidatosPorEdital();

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DoorOpen className="h-6 w-6" />
            Alocação de Candidatos
          </h1>
          <p className="text-muted-foreground">
            Escolha a prova para distribuir os inscritos do edital nas salas.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando provas…
          </div>
        ) : provas.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma prova cadastrada. Crie a prova em Provas antes de alocar candidatos.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {provas.map((prova) => {
              const inscritos = prova.edital_id ? contagem[prova.edital_id] : undefined;
              return (
                <Card key={prova.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span>{prova.editais?.nome ?? prova.prova_edital}</span>
                      {prova.prova_finalizada && <Badge variant="secondary">Finalizada</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground space-y-1">
                      {dataLegivel(prova.prova_data) && <div>Data: {dataLegivel(prova.prova_data)}</div>}
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        {inscritos !== undefined
                          ? `${inscritos.toLocaleString("pt-BR")} inscrito(s) no edital`
                          : "Sem lista de inscritos importada"}
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => navigate(`/alocacao-candidatos/${prova.id}`)}
                    >
                      Abrir alocação
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

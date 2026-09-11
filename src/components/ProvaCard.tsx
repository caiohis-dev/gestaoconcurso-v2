import { useState } from "react";
import { Link } from "react-router-dom";
import { Prova } from "@/hooks/useProvas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Settings, Flashlight } from "lucide-react";
import { formatDateBR } from "@/lib/utils";
import { ProvaTotaisDialog } from "./ProvaTotaisDialog";

interface ProvaCardProps {
  prova: Prova;
  /** When defined, restricts displayed units to these prova_unidade ids (coordenador scope). */
  allowedProvaUnidadeIds?: string[] | null;
}

/**
 * O cartão de uma prova na listagem de `/provas`.
 *
 * 🔴 ELE NÃO CONSULTA NADA. Tudo que mostra vem da prop `prova`, e isso é o ponto.
 *
 * Até 2026-09-10 este cartão trazia os totalizadores embutidos e, para montá-los, fazia
 * TRÊS consultas ao montar (`prova_unidades`, `meta_colaboradores_unidade`,
 * `colaboradores_prova`), somando tudo no cliente. Medido no banco local (cópia de
 * produção), na maior das 2 provas — 11 unidades, 531 alocações: **122.418 bytes em 3
 * requisições, por cartão**. Como `/provas` renderiza um cartão por prova, sem paginação,
 * e provas nunca são apagadas, o custo da tela crescia com o histórico inteiro do sistema
 * — e se repetia a cada volta de foco da janela.
 *
 * Os totais foram para {@link ProvaTotaisDialog}, atrás do botão da lanterna, e a soma
 * passou a ser feita no banco (RPC `totais_da_prova`).
 *
 * ⚠️ Ao acrescentar informação aqui, pergunte de onde ela vem. Um `useQuery` novo neste
 * arquivo multiplica por prova outra vez, e a tela não denuncia — ela só fica lenta.
 * Há teste guardando isso (`ProvaCard.ui.test.tsx`).
 */
export function ProvaCard({ prova, allowedProvaUnidadeIds }: ProvaCardProps) {
  const [totaisAbertos, setTotaisAbertos] = useState(false);

  const formatDate = (dateStr: string | null) =>
    formatDateBR(dateStr, "dd 'de' MMMM 'de' yyyy");
  const formatTime = (t: string | null) => (t ? t.slice(0, 5) : null);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-semibold leading-tight">
            {prova.editais?.nome}
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            {/* A lanterna vem ANTES da engrenagem, e vale para admin e coordenador: o
                coordenador já via a lista por unidade antes desta mudança. */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTotaisAbertos(true)}
              aria-label="Ver totais de cargos"
              title="Ver totais de cargos"
            >
              <Flashlight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link to={`/gerenciar-prova/${prova.id}`} aria-label="Gerenciar prova">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {prova.prova_data && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(prova.prova_data)}</span>
            </div>
          )}
          {(prova.prova_hora_inicio || prova.prova_hora_final) && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>
                {formatTime(prova.prova_hora_inicio)} - {formatTime(prova.prova_hora_final)}
              </span>
            </div>
          )}
        </div>

        {prova.profiles?.full_name && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Criado por: {prova.profiles.full_name}
            </p>
          </div>
        )}
      </CardContent>

      <ProvaTotaisDialog
        provaId={prova.id}
        titulo={prova.editais?.nome ?? "esta prova"}
        allowedProvaUnidadeIds={allowedProvaUnidadeIds}
        open={totaisAbertos}
        onOpenChange={setTotaisAbertos}
      />
    </Card>
  );
}

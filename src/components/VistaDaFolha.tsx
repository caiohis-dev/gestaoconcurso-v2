/**
 * O editor do capítulo `recursos_prova_objetiva` — a vista da folha de respostas.
 *
 * 🔵 2026-11-16. Até aqui o capítulo não tinha editor, e os dois campos dele
 * (`{{campo:email_vista_folha}}`, `{{campo:intersticio_vista_horas}}`) não tinham por onde
 * ser preenchidos. Ver `useVistaDeProva`.
 *
 * ⚠️ O e-mail é o MESMO que a regra `email-da-vista-fora-dos-canais` cruza com os canais de
 * atendimento da inscrição — são duas colunas guardando o mesmo endereço (dívida R1, no
 * backlog). A dica abaixo diz isso a quem preenche.
 */
import { useVistaDeProva } from "@/hooks/useVistaDeProva";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function VistaDaFolha({ editalId }: { editalId: string }) {
  const { vista, isLoading, salvar } = useVistaDeProva(editalId);
  const { toast } = useToast();

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando a vista da folha…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vista da folha de respostas</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          E-mail para pedir vista
          <Input
            type="email"
            defaultValue={vista?.email_solicitacao ?? ""}
            onBlur={(e) => salvar({ email_solicitacao: e.target.value.trim() || null })}
          />
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Tem de ser um dos canais de atendimento da inscrição — senão o painel de pendências avisa.
          </span>
        </label>
        <label className="text-sm">
          Interstício mínimo (horas úteis)
          <Input
            type="number"
            step={1}
            min={0}
            defaultValue={vista?.intersticio_minimo_horas ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === "") return salvar({ intersticio_minimo_horas: null });
              const n = Number(v);
              // A coluna é `integer`: 1,5 seria recusado pelo banco com mensagem técnica.
              // Arredondar calado mudaria o que a pessoa digitou — então diz e não grava.
              if (!Number.isInteger(n)) {
                toast({ title: "O interstício é em horas inteiras", description: `"${v}" não foi salvo.`, variant: "destructive" });
                return;
              }
              salvar({ intersticio_minimo_horas: n });
            }}
          />
        </label>
      </CardContent>
    </Card>
  );
}

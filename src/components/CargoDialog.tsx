import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Cargo } from "@/hooks/useCargos";
import { CONSELHOS } from "@/lib/edital-investidura";

/** Os quatro níveis do `chk_cargo_escolaridade_minima`. */
const ESCOLARIDADES = [
  { valor: "FUNDAMENTAL", rotulo: "Ensino Fundamental" },
  { valor: "MEDIO", rotulo: "Ensino Médio" },
  { valor: "TECNICO", rotulo: "Técnico" },
  { valor: "SUPERIOR", rotulo: "Superior" },
] as const;

/** Marcador do "ainda não declarado" nos selects — `<SelectItem>` não aceita valor vazio. */
const NAO_DECLARADO = "__nao_declarado__";

/**
 * ⭐ Exportado porque os testes o importam — é o padrão do repo desde 2026-07-25, e o
 * custo aceito é o aviso de `react-refresh/only-export-components`.
 *
 * Só o nome é validado aqui, e o mínimo: o `chk_cargo_nome_preenchido` do banco é a
 * barreira de verdade, e a unicidade (sobre a coluna gerada `nome_chave`) só o banco
 * sabe conferir. Duplicar essas regras no Zod criaria duas fontes que divergem.
 */
export const cargoFormSchema = z.object({
  nome: z.string().trim().min(1, "O nome do cargo é obrigatório"),
  // 🔵 Os dois entraram em 2026-09-17, com a fatia 8. Eles existiam no banco desde
  // 16/09 e eram ÓRFÃOS — nenhuma tela os escrevia e nenhum código os lia, embora o
  // cabeçalho do `QuadroDeCargos` já afirmasse haver uma "trava de conselho de classe".
  //
  // 🔴 `conselho_classe_obrigatorio` é o que torna impossível o defeito do Edital 004
  // (Certidão do COREN exigida de Agente Comunitário de Saúde): sem ele declarado, o
  // checklist de investidura não tem sobre o que decidir. Ver `edital-investidura.ts`.
  //
  // ⚠️ Os dois são OPCIONAIS aqui, e é escolha: quem cadastra um cargo às pressas não
  // deve ser barrado. Quem acusa a falta é o linter do edital, que distingue "não
  // declarado" (nulo) de "declarado: não tem conselho" ('NENHUM').
  escolaridade_minima: z.string().nullable().default(null),
  conselho_classe_obrigatorio: z.string().nullable().default(null),
});

type FormData = z.infer<typeof cargoFormSchema>;

interface CargoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Presente = editando; ausente = criando. É o que governa título, texto e botão. */
  cargo?: Cargo | null;
  onSubmit: (dados: {
    nome: string;
    escolaridade_minima: string | null;
    conselho_classe_obrigatorio: string | null;
  }) => void;
  isLoading?: boolean;
}

export function CargoDialog({ open, onOpenChange, cargo, isLoading, onSubmit }: CargoDialogProps) {
  const isEditing = !!cargo;

  const form = useForm<FormData>({
    resolver: zodResolver(cargoFormSchema),
    defaultValues: { nome: "", escolaridade_minima: null, conselho_classe_obrigatorio: null },
  });

  // ⚠️ O ramo `else` NÃO é redundante: sem ele, abrir "Novo cargo" depois de ter editado
  // um traz o formulário preenchido com o cargo anterior — e o usuário renomeia sem
  // querer, ou cria um duplicado. Mesma armadilha documentada no EditalDialog.
  useEffect(() => {
    form.reset({
      nome: cargo?.nome ?? "",
      escolaridade_minima: cargo?.escolaridade_minima ?? null,
      conselho_classe_obrigatorio: cargo?.conselho_classe_obrigatorio ?? null,
    });
  }, [cargo, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Renomear cargo" : "Novo cargo"}</DialogTitle>
          <DialogDescription>
            {isEditing ? (
              <>
                O novo nome passa a aparecer na lista e na ficha de todos os inscritos deste
                cargo. Nenhum inscrito é duplicado ou perdido.
              </>
            ) : (
              <>
                O catálogo é global: um cargo criado aqui vale para todos os editais.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((d) =>
              onSubmit({
                nome: d.nome.trim(),
                escolaridade_minima: d.escolaridade_minima,
                conselho_classe_obrigatorio: d.conselho_classe_obrigatorio,
              }),
            )}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do cargo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: DOCENTE I — HISTÓRIA" {...field} />
                  </FormControl>
                  <FormDescription>
                    Dois cargos não podem ter o mesmo nome. A comparação ignora maiúsculas e
                    espaços nas pontas.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="escolaridade_minima"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Escolaridade mínima</FormLabel>
                  <Select
                    value={field.value ?? NAO_DECLARADO}
                    onValueChange={(v) => field.onChange(v === NAO_DECLARADO ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Não declarada" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NAO_DECLARADO}>Não declarada</SelectItem>
                      {ESCOLARIDADES.map((e) => (
                        <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="conselho_classe_obrigatorio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conselho de classe</FormLabel>
                  <Select
                    value={field.value ?? NAO_DECLARADO}
                    onValueChange={(v) => field.onChange(v === NAO_DECLARADO ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Não declarado" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NAO_DECLARADO}>Não declarado</SelectItem>
                      {/* 🔴 "Não exige" é DIFERENTE de "não declarado", e a diferença é o
                          que impede a regra de degradar em silêncio: nulo significa que
                          ninguém disse, e o linter do edital acusa. */}
                      <SelectItem value="NENHUM">Não exige conselho</SelectItem>
                      {CONSELHOS.map((c) => (
                        <SelectItem key={c.sigla} value={c.sigla}>
                          {c.sigla} — {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Define quais documentos de conselho o checklist de investidura pode
                    oferecer. Foi a falta disso que pôs a Certidão do COREN num edital de
                    Agente Comunitário de Saúde.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isEditing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

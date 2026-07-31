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
import { Cargo } from "@/hooks/useCargos";

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
});

type FormData = z.infer<typeof cargoFormSchema>;

interface CargoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Presente = editando; ausente = criando. É o que governa título, texto e botão. */
  cargo?: Cargo | null;
  onSubmit: (nome: string) => void;
  isLoading?: boolean;
}

export function CargoDialog({ open, onOpenChange, cargo, isLoading, onSubmit }: CargoDialogProps) {
  const isEditing = !!cargo;

  const form = useForm<FormData>({
    resolver: zodResolver(cargoFormSchema),
    defaultValues: { nome: "" },
  });

  // ⚠️ O ramo `else` NÃO é redundante: sem ele, abrir "Novo cargo" depois de ter editado
  // um traz o formulário preenchido com o cargo anterior — e o usuário renomeia sem
  // querer, ou cria um duplicado. Mesma armadilha documentada no EditalDialog.
  useEffect(() => {
    form.reset({ nome: cargo?.nome ?? "" });
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
          <form onSubmit={form.handleSubmit((d) => onSubmit(d.nome.trim()))} className="space-y-4">
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

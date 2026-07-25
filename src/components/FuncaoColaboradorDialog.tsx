import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { FuncaoColaborador } from "@/hooks/useFuncoesColaboradores";

export const formSchema = z.object({
  cargo_nome: z.string().min(1, "Nome é obrigatório").max(35, "Máximo 35 caracteres"),
  cargo_cbo: z.string().max(7, "Máximo 7 caracteres").optional(),
  cargo_descricao: z.string().max(1000, "Máximo 1000 caracteres").optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FuncaoColaboradorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcao?: FuncaoColaborador | null;
  onSubmit: (data: FormValues) => void;
  isLoading?: boolean;
}

// Verifica se é função do sistema (nome não pode ser editado)
const isFuncaoSistema = (funcao?: FuncaoColaborador | null): boolean => {
  return funcao?.cargo_editavel === false;
};

export default function FuncaoColaboradorDialog({
  open,
  onOpenChange,
  funcao,
  onSubmit,
  isLoading,
}: FuncaoColaboradorDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cargo_nome: "",
      cargo_cbo: "",
      cargo_descricao: "",
    },
  });

  useEffect(() => {
    if (funcao) {
      form.reset({
        cargo_nome: funcao.cargo_nome,
        cargo_cbo: funcao.cargo_cbo || "",
        cargo_descricao: funcao.cargo_descricao || "",
      });
    } else {
      form.reset({
        cargo_nome: "",
        cargo_cbo: "",
        cargo_descricao: "",
      });
    }
  }, [funcao, form]);

  const handleSubmit = (data: FormValues) => {
    onSubmit(data);
  };

  const isEditingSistema = isFuncaoSistema(funcao);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {funcao ? "Editar Função" : "Nova Função"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="cargo_nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Função *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Fiscal de Sala"
                      maxLength={35}
                      disabled={isEditingSistema}
                      {...field}
                    />
                  </FormControl>
                  {isEditingSistema && (
                    <p className="text-xs text-muted-foreground">
                      Função básica do sistema - nome não pode ser alterado
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cargo_cbo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CBO</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: 2410-05"
                      maxLength={7}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cargo_descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva as responsabilidades desta função..."
                      maxLength={1000}
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {funcao ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

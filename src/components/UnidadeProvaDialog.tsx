import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { UnidadeProva, UnidadeProvaInsert, UnidadeProvaUpdate } from "@/hooks/useUnidadesProva";

export const formSchema = z.object({
  unid_nome: z.string().min(1, "Nome é obrigatório").max(30, "Máximo 30 caracteres"),
  unid_sigla: z.string().min(1, "Sigla é obrigatória").max(10, "Máximo 10 caracteres"),
  unid_andares: z.coerce.number().min(1, "Mínimo 1 andar").max(99, "Máximo 99 andares"),
});

type FormData = z.infer<typeof formSchema>;

interface UnidadeProvaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidade?: UnidadeProva | null;
  onSubmit: (data: UnidadeProvaInsert | UnidadeProvaUpdate) => void;
  isLoading?: boolean;
}

export function UnidadeProvaDialog({
  open,
  onOpenChange,
  unidade,
  onSubmit,
  isLoading,
}: UnidadeProvaDialogProps) {
  const isEditing = !!unidade;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      unid_nome: "",
      unid_sigla: "",
      unid_andares: 1,
    },
  });

  useEffect(() => {
    if (unidade) {
      form.reset({
        unid_nome: unidade.unid_nome,
        unid_sigla: unidade.unid_sigla.trim(),
        unid_andares: unidade.unid_andares,
      });
    } else {
      form.reset({
        unid_nome: "",
        unid_sigla: "",
        unid_andares: 1,
      });
    }
  }, [unidade, form]);

  const handleSubmit = (data: FormData) => {
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Unidade de Prova" : "Nova Unidade de Prova"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize o local onde as provas são aplicadas. O número de andares limita em que andar as salas podem ficar."
              : "Cadastre o local onde as provas são aplicadas. O número de andares limita em que andar as salas podem ficar."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="unid_nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome da unidade" {...field} maxLength={30} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unid_sigla"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sigla</FormLabel>
                  <FormControl>
                    <Input placeholder="Sigla" {...field} maxLength={10} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unid_andares"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade de Andares</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={99} {...field} />
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
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

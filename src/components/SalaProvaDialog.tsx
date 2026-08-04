import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { SalaProva } from "@/hooks/useSalasProva";
import { numerosDoLote, resumoDoLote } from "@/lib/salas";

/**
 * 🔵 **A faixa de andares é de 2026-08-03.** `quantidade` passou a ser **por andar**: o
 * formulário pede `De`/`Até` e o total é `quantidade × (até − de + 1)`. Até aqui havia um
 * `sala_andar` só, e não existia jeito de criar salas em vários andares de uma vez.
 *
 * 🔴 **O teto por unidade caiu em 2026-08-03.** Estes schemas eram FÁBRICAS: recebiam o
 * `unid_andares` do cadastro e fechavam o andar em cima dele. A coluna foi dropada — a
 * unidade não declara mais andares —, então não há andar "que não existe": pode-se criar
 * sala em qualquer andar, e o cadastro da unidade deixou de ser pré-requisito.
 *
 * ⚠️ **`ANDAR_MAXIMO` não é o teto de volta com outro nome.** É limite de FORMATO: a
 * numeração é `andar × 100 + sequência`, então do andar 100 em diante o número da sala
 * passa a ter 5 dígitos (10001) e muda a cara de toda lista impressa. Ver `lib/salas.ts`.
 *
 * ⚠️ **Os inputs NÃO têm `min`/`max` nativos.** É deliberado: com eles, o navegador barra
 * o submit com um balão no idioma dele e a mensagem em português deste schema nunca
 * aparece — é a armadilha 7 de `testes.md`.
 */
export const ANDAR_MAXIMO = 99;

export const createFormSchema = () =>
  z
    .object({
      quantidade: z.coerce.number().int().min(1, "Mínimo 1 sala").max(50, "Máximo 50 salas por andar"),
      sala_capacidade: z.coerce.number().int().positive("Capacidade deve ser positiva"),
      andar_de: z.coerce.number().int().min(1, "O andar inicial é 1 ou maior").max(ANDAR_MAXIMO, `O andar vai até ${ANDAR_MAXIMO}`),
      andar_ate: z.coerce.number().int().min(1, "O andar final é 1 ou maior").max(ANDAR_MAXIMO, `O andar vai até ${ANDAR_MAXIMO}`),
    })
    .refine((d) => d.andar_ate >= d.andar_de, {
      message: "O andar final não pode ser menor que o inicial",
      path: ["andar_ate"],
    });

/**
 * 🔵 **Também deixou de ser fábrica de teto em 2026-08-03.**
 *
 * ⚠️ Vale registrar o que morreu junto: por algumas horas de 03/08 este schema recebia
 * `max(maxAndares, andar da própria sala)`, um remendo para que baixar o `unid_andares`
 * não deixasse uma sala do andar 2 **impossível de salvar — nem para corrigir a
 * capacidade**. Sem teto por unidade, a classe inteira de defeito deixou de existir: não
 * sobrou o que remendar.
 */
export const editFormSchema = () => z.object({
  sala_numero: z.coerce.number().int().positive("Número deve ser positivo"),
  sala_descricao: z.string().max(50, "Máximo 50 caracteres").optional().or(z.literal("")),
  sala_capacidade: z.coerce.number().int().positive("Capacidade deve ser positiva"),
  sala_andar: z.coerce.number().int().min(1, "Andar deve ser 1 ou maior").max(ANDAR_MAXIMO, `O andar vai até ${ANDAR_MAXIMO}`).optional().or(z.literal("")),
});

type CreateFormData = z.infer<ReturnType<typeof createFormSchema>>;
type EditFormData = z.infer<ReturnType<typeof editFormSchema>>;

export interface CreateSalaData {
  quantidade: number;
  sala_capacidade: number;
  andar_de: number;
  andar_ate: number;
}

export interface EditSalaData {
  sala_numero: number;
  sala_descricao?: string;
  sala_capacidade: number;
  /** `null` quando a pessoa apagou o campo — ver `SalaProvaUpdate.sala_andar`. */
  sala_andar?: number | null;
}

interface SalaProvaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sala: SalaProva | null;
  onSubmit: (data: CreateSalaData | EditSalaData) => void;
  isLoading: boolean;
  /** Números já usados na unidade — alimentam a prévia da numeração. */
  numerosExistentes: number[];
}

const CRIACAO_PADRAO = { quantidade: 1, sala_capacidade: 0, andar_de: 1, andar_ate: 1 };

export function SalaProvaDialog({
  open,
  onOpenChange,
  sala,
  onSubmit,
  isLoading,
  numerosExistentes,
}: SalaProvaDialogProps) {
  const isEditing = !!sala;

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createFormSchema()),
    defaultValues: CRIACAO_PADRAO,
  });

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema()),
    defaultValues: {
      sala_numero: 0,
      sala_descricao: "",
      sala_capacidade: 0,
      sala_andar: "",
    },
  });

  useEffect(() => {
    if (sala) {
      editForm.reset({
        sala_numero: sala.sala_numero,
        sala_descricao: sala.sala_descricao ?? "",
        sala_capacidade: sala.sala_capacidade,
        sala_andar: sala.sala_andar ?? "",
      });
    } else {
      createForm.reset(CRIACAO_PADRAO);
    }
    // ⚠️ `open` está nas deps de propósito: sem ele, criar → fechar → abrir mantinha o que
    // foi digitado, porque `sala` continua `null` e o efeito não roda de novo. Vindo da
    // edição o formulário resetava; vindo de outra criação, não.
  }, [sala, open, createForm, editForm]);

  const handleCreateSubmit = (data: CreateFormData) => {
    onSubmit({
      quantidade: data.quantidade,
      sala_capacidade: data.sala_capacidade,
      andar_de: data.andar_de,
      andar_ate: data.andar_ate,
    } as CreateSalaData);
  };

  const handleEditSubmit = (data: EditFormData) => {
    onSubmit({
      sala_numero: data.sala_numero,
      sala_descricao: data.sala_descricao === "" ? undefined : data.sala_descricao,
      sala_capacidade: data.sala_capacidade,
      // 🔴 `null`, não `undefined`: campo apagado precisa VIAJAR para apagar a coluna.
      sala_andar: data.sala_andar === "" ? null : data.sala_andar,
    } as EditSalaData);
  };

  // A prévia acompanha o que está sendo digitado — os três campos entram na conta.
  const quantidadeDigitada = Number(createForm.watch("quantidade"));
  const deDigitado = Number(createForm.watch("andar_de"));
  const ateDigitado = Number(createForm.watch("andar_ate"));
  const previa = numerosDoLote(
    { quantidade: quantidadeDigitada, andarDe: deDigitado, andarAte: ateDigitado },
    numerosExistentes,
  );
  // Enquanto um campo está a meio de ser digitado, a prévia cala: acusar "quantidade
  // precisa ser 1 ou mais" a cada tecla apagada é ruído, não ajuda.
  const entradaCompleta = [quantidadeDigitada, deDigitado, ateDigitado].every(
    (n) => Number.isInteger(n) && n >= 1,
  );

  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Sala</DialogTitle>
            <DialogDescription>
              Atualize as informações da sala de prova.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="sala_numero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número *</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="sala_capacidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacidade *</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="sala_descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Sala de Informática" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="sala_andar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Andar</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Ex: 2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Novas Salas</DialogTitle>
          <DialogDescription>
            A quantidade vale para <strong>cada andar</strong> da faixa.
          </DialogDescription>
        </DialogHeader>
        <Form {...createForm}>
          <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={createForm.control}
                name="quantidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salas por Andar *</FormLabel>
                    <FormControl>
                      {/* Sem `min`/`max` nativos: eles barram o submit com balão do
                          navegador e escondem a mensagem do schema (armadilha 7). */}
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="sala_capacidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacidade *</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={createForm.control}
                name="andar_de"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Do andar *</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Ex: 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="andar_ate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Até o andar *</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Ex: 3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {entradaCompleta &&
              (previa.erro ? (
                <p className="text-sm rounded-md bg-destructive/10 text-destructive px-3 py-2">
                  {previa.erro}
                </p>
              ) : (
                <p className="text-sm rounded-md bg-muted px-3 py-2">
                  Serão criadas <strong>{previa.total}</strong>{" "}
                  {previa.total === 1 ? "sala" : "salas"}:{" "}
                  <span className="font-mono">{resumoDoLote(previa.andares)}</span>
                </p>
              ))}

            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { z } from "zod";
import { PAPEIS_SISTEMA } from "@/hooks/useUsers";

/**
 * O que acontece ao conceder papel de sistema a este colaborador — a MESMA decisão que a
 * EF `conceder-papel-sistema` toma, antecipada na tela para o superadmin saber antes do
 * clique. A tela não decide nada: se divergir, quem manda é a EF.
 *
 *  - `tem-conta`: vinculado. Só o papel entra; senha e e-mail não são tocados.
 *  - `convite`: sem conta, com e-mail. A conta nasce pelo convite e a pessoa cria a senha.
 *  - `sem-email`: não há para onde mandar o convite. Aparece desabilitado, com o motivo —
 *    sumir da lista seria perda silenciosa (o superadmin procuraria e nada diria por quê).
 */
export type SituacaoAcesso = "tem-conta" | "convite" | "sem-email";

export function situacaoAcesso(c: { user_id: string | null; colab_email: string | null }): SituacaoAcesso {
  if (c.user_id) return "tem-conta";
  if (c.colab_email?.trim()) return "convite";
  return "sem-email";
}

export const DESCRICAO_SITUACAO: Record<SituacaoAcesso, string> = {
  "tem-conta": "Já tem conta — recebe só o papel",
  convite: "Sem conta — receberá o link para criar a senha",
  "sem-email": "Sem e-mail no cadastro — cadastre o e-mail em Colaboradores primeiro",
};

export const concederPapelSchema = z.object({
  colaboradorId: z.string().uuid("Selecione um colaborador"),
  // `coordenador` não entra: coordenação depende de ALOCAÇÃO numa prova e é concedida
  // no CoordenadoresProvaDialog. `user` e `colaborador` também não — não são papéis de
  // sistema, e o trigger `handle_new_user` já os concede.
  role: z.enum(PAPEIS_SISTEMA),
});

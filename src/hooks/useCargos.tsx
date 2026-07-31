import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Camada de dados dos CARGOS — o catálogo canônico e a memória de apelidos.
 *
 * Doc da feature: `my_rules/estrutura/modulos/candidatos/cargos.md` (o roadmap do tema está
 * arquivado em `my_rules/analises/concluidos/roadmap-cargos.yaml`).
 *
 * Dois consumidores: o passo "Cargos" do assistente de importação, que resolve texto sujo
 * em `cargo_id`, e o **filtro por cargo** da listagem, que só usa `useCargos`.
 *
 * ⚠️ `cargos` NÃO tem relação com `funcoes_colaboradores`. Aquela é o que o COLABORADOR faz
 * ao aplicar a prova (tem pagamento, meta, alocação); esta é a vaga a que o CANDIDATO
 * concorre. Os vocabulários colidem — aquela tabela tem uma coluna `cargo_editavel` — e as
 * entidades são opostas. Nunca unificar.
 */

export interface Cargo {
  id: string;
  nome: string;
  /** `lower(btrim(nome))`, coluna GERADA pelo banco. Nunca escrever pelo app. */
  nome_chave: string | null;
  ativo: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** Um texto de planilha e o cargo que ele significa. */
export interface CargoApelido {
  texto_origem: string;
  texto_chave: string | null;
  cargo_id: string;
}

/** Um cargo com o quanto ele é usado — o que a tela de gestão precisa saber para decidir. */
export interface CargoComUso extends Cargo {
  /** Inscritos apontando para este cargo. É o que a FK RESTRICT protege. */
  candidatos: number;
  /** Textos de planilha memorizados. ⚠️ Desde 31/07 eles BARRAM a exclusão (RESTRICT). */
  apelidos: number;
}

/**
 * Cargo com menção em qualquer outra tabela é IMUTÁVEL — nem altera, nem exclui.
 *
 * Decisão do usuário em 2026-07-31, e a barreira de verdade é o banco (trigger `CG001` +
 * as duas FKs RESTRICT). Esta função existe para a tela ANTECIPAR a recusa: deixar o
 * usuário abrir o diálogo, digitar e só então levar erro é barrar sem orientar.
 *
 * ⚠️ NÃO é pré-check de autorização: se ela discordar do banco, quem manda é o banco.
 */
export function cargoTemMencao(cargo: CargoComUso): boolean {
  return cargo.candidatos > 0 || cargo.apelidos > 0;
}

/**
 * Traduz o erro do Postgres para o que a pessoa pode fazer a respeito.
 *
 * Regra 4 de `invariantes.md`: barreira que devolve erro cru transfere o problema. E a
 * regra que este repo já teve de aprender duas vezes — **mensagem vinda do banco passa
 * adiante; texto próprio é fallback**, nunca substituto.
 *
 * ⚠️ `cargos_nome_chave_key` ficou FORA daqui até 2026-07-30, e o motivo era bom: quem
 * criava era só o `criarCargo`, que transforma a duplicata em sucesso — a violação nunca
 * chegava à UI. **A página de gestão mudou isso:** RENOMEAR para um nome que já existe
 * viola o mesmo índice e não tem para onde escapar. Sem este ramo, a tela mostraria
 * `duplicate key value violates unique constraint "cargos_nome_chave_key"` cru.
 *
 * O ramo é inofensivo para o `criarCargo`, que continua sem alcançá-lo.
 */
export function mensagemErroCargo(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("tem menção em outra tabela")) {
    // A mensagem do trigger CG001 já traz o nome e as duas contagens — é exatamente o que
    // o usuário precisa. Passa adiante inteira, como manda a regra da casa.
    return mensagem;
  }
  if (m.includes("candidatos_cargo_id_fkey")) {
    return "Este cargo está em uso por candidatos e não pode ser excluído.";
  }
  if (m.includes("cargo_apelidos_cargo_id_fkey")) {
    // RESTRICT desde 31/07 (era CASCADE): o apelido deixou de ser levado junto e passou a
    // barrar. Dizer QUAL vínculo bloqueia, porque a providência é outra.
    return "Este cargo tem textos de planilha memorizados e não pode ser excluído.";
  }
  if (m.includes("cargos_nome_chave_key")) {
    // A unicidade é sobre a coluna GERADA `nome_chave` (lower + btrim), então "Docente II"
    // e " docente ii " colidem. Dizer só "nome duplicado" deixaria o usuário olhando dois
    // textos diferentes na tela sem entender por que o banco os considera iguais.
    return "Já existe um cargo com esse nome (a comparação ignora maiúsculas e espaços nas pontas).";
  }
  if (m.includes("chk_cargo_nome_preenchido")) return "O nome do cargo não pode ficar em branco.";
  if (m.includes("row-level security") || m.includes("permission denied")) {
    return "Sem permissão para alterar cargos. É necessário ser administrador.";
  }
  return mensagem;
}

/**
 * O catálogo inteiro, ordenado por nome.
 *
 * Lista TUDO, inclusive `ativo = false`. A coluna existe para uma futura tela de gestão
 * (etapa 7 do roadmap) e não tem consumidor hoje — filtrar aqui esconderia cargo que já
 * está em uso por candidatos, e a lista do passo de importação precisa poder exibir o
 * cargo de qualquer inscrito já gravado.
 */
export function useCargos() {
  const query = useQuery({
    queryKey: ["cargos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargos")
        .select("id, nome, nome_chave, ativo, created_at, updated_at")
        .order("nome", { ascending: true });

      if (error) throw error;
      return (data ?? []) as Cargo[];
    },
  });

  return {
    cargos: query.data ?? [],
    // ⚠️ Quem consome PRECISA distinguir "ainda não sei" de "não há cargos". É o padrão de
    // defeito mais repetido deste repo — apareceu três vezes num único dia em 26/07. Se a
    // tela do passo 3 tratar carregando como catálogo vazio, ela mostra todo cargo como
    // não-associado e o usuário cria duplicata do que já existe.
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * A memória "este texto de planilha significa aquele cargo", já como mapa pronto para o
 * pré-preenchimento: `texto_chave` → `cargo_id`.
 *
 * A chave é o `texto_chave` do banco (coluna gerada, `lower(btrim(texto_origem))`), que é a
 * MESMA normalização de `cargosDaPlanilha`. Se as duas divergirem, o pré-preenchimento erra
 * o alvo em silêncio — o cargo aparece como não-associado mesmo tendo sido resolvido antes.
 */
export function useCargoApelidos() {
  const query = useQuery({
    queryKey: ["cargo_apelidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargo_apelidos")
        .select("texto_origem, texto_chave, cargo_id");

      if (error) throw error;

      const porTexto = new Map<string, string>();
      for (const a of (data ?? []) as CargoApelido[]) {
        // `texto_chave` é gerada e nunca é nula na prática; o fallback existe porque o
        // tipo gerado a declara nullable, e recalcular é mais honesto que um `!`.
        porTexto.set(a.texto_chave ?? a.texto_origem.trim().toLowerCase(), a.cargo_id);
      }
      return porTexto;
    },
  });

  return {
    apelidos: query.data ?? new Map<string, string>(),
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Cria um cargo — ou devolve o que já existe com aquele nome.
 *
 * ⭐ POR QUE `ignoreDuplicates: true` E NÃO `false`, que é o que o roadmap propunha:
 * medido contra o banco real em 2026-07-27. Com `merge-duplicates` (ON CONFLICT DO UPDATE),
 * criar "docente ii" quando existe "DOCENTE II" **RENOMEIA o cargo existente** — a resposta
 * do PostgREST volta com `nome: "docente ii"` e o catálogo inteiro passa a exibir a grafia
 * nova. Seria um efeito colateral invisível: o usuário quis criar e acabou renomeando o
 * cargo de milhares de inscritos.
 *
 * Com `ignore-duplicates` (ON CONFLICT DO NOTHING) o nome existente é PRESERVADO, e a
 * resposta volta `[]`. Daí os dois passos abaixo: `[]` significa "já existia", e aí se
 * busca o id de quem está lá.
 *
 * Os dois passos também são o que resolve a corrida de dois admins importando ao mesmo
 * tempo (D10): quem perde recebe `[]` e passa a usar a linha de quem ganhou. Não há como
 * os dois criarem duplicata — o índice único não deixa.
 */
export function useCriarCargo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (nome: string): Promise<Cargo> => {
      const { data: userData } = await supabase.auth.getUser();
      const nomeLimpo = nome.trim();

      const { data: criados, error } = await supabase
        .from("cargos")
        .upsert(
          { nome: nomeLimpo, created_by: userData.user?.id ?? null },
          { onConflict: "nome_chave", ignoreDuplicates: true },
        )
        .select("id, nome, nome_chave, ativo, created_at, updated_at");

      if (error) throw error;

      const criado = (criados ?? [])[0] as Cargo | undefined;
      if (criado) return criado;

      // Chegou aqui: o cargo já existia. Busca o dono do nome, que é quem o usuário quis.
      const { data: existente, error: erroBusca } = await supabase
        .from("cargos")
        .select("id, nome, nome_chave, ativo, created_at, updated_at")
        .eq("nome_chave", nomeLimpo.toLowerCase())
        .maybeSingle();

      if (erroBusca) throw erroBusca;
      if (!existente) {
        // Não deveria acontecer: o upsert não inseriu, logo havia conflito. Se acontecer,
        // dizer isso é melhor do que devolver undefined e quebrar a tela mais adiante.
        throw new Error(`O cargo "${nomeLimpo}" não pôde ser criado nem localizado.`);
      }
      return existente as Cargo;
    },
    onSuccess: () => {
      // Sem isto o Select do passo 3 não mostra o cargo recém-criado, e o usuário tenta
      // criá-lo de novo.
      queryClient.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro ao criar cargo",
        description: mensagemErroCargo(error.message),
        variant: "destructive",
      });
    },
  });

  return {
    criarCargo: mutation.mutateAsync,
    isCriando: mutation.isPending,
  };
}

/**
 * O catálogo com o USO de cada cargo — quantos inscritos e quantos apelidos.
 *
 * Existe separado de `useCargos()` porque só a tela de gestão precisa das contagens: o
 * passo 3 do assistente carrega o catálogo a cada importação e não tem uso para elas.
 *
 * ⭐ UMA requisição, não uma por cargo. O embed de agregação do PostgREST
 * (`candidatos(count)`) resolve no servidor — foi medido em 2026-07-30 antes de o código
 * existir, justamente porque o fallback seria uma RPC e mudaria o escopo. O índice
 * `idx_candidatos_cargo` é o que torna a contagem barata.
 *
 * ⚠️ Cargo sem uso volta `[{ count: 0 }]`, NÃO array vazio — também medido. Um
 * `?.[0]?.count ?? 0` cobre os dois casos e não depende dessa observação continuar valendo.
 *
 * ⭐ A queryKey é `["cargos", "com-uso"]` e isso NÃO exige invalidação própria: o
 * `invalidateQueries({ queryKey: ["cargos"] })` das mutations casa por PREFIXO e alcança
 * esta também. Não acrescente uma segunda invalidação achando que falta — ela seria
 * redundante, e redundância aqui é a forma de alguém depois "limpar" a errada.
 */
export function useCargosComUso() {
  const query = useQuery({
    queryKey: ["cargos", "com-uso"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargos")
        .select(
          "id, nome, nome_chave, ativo, created_at, updated_at, candidatos(count), cargo_apelidos(count)",
        )
        .order("nome", { ascending: true });

      if (error) throw error;

      type LinhaComContagem = Cargo & {
        candidatos: { count: number }[] | null;
        cargo_apelidos: { count: number }[] | null;
      };

      return ((data ?? []) as LinhaComContagem[]).map((c) => ({
        id: c.id,
        nome: c.nome,
        nome_chave: c.nome_chave,
        ativo: c.ativo,
        created_at: c.created_at,
        updated_at: c.updated_at,
        candidatos: c.candidatos?.[0]?.count ?? 0,
        apelidos: c.cargo_apelidos?.[0]?.count ?? 0,
      })) as CargoComUso[];
    },
  });

  return {
    cargos: query.data ?? [],
    // Mesma advertência de `useCargos`: carregando NÃO é catálogo vazio.
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Renomeia um cargo.
 *
 * ⭐ É a operação mais valiosa da tela, e só é segura por causa da etapa 5: com
 * `cargo_id` na chave natural, o nome virou ATRIBUTO. Renomear é um `UPDATE` numa linha e
 * não duplica ninguém — antes da etapa 5, a mesma correção criava 481 registros.
 *
 * ⚠️ NÃO escrever `nome_chave`: é coluna GENERATED, o banco a recalcula sozinha no
 * rename. Preenchê-la à mão é erro de escrita em coluna gerada.
 */
export function useAtualizarCargo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }): Promise<void> => {
      const { error } = await supabase.from("cargos").update({ nome: nome.trim() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cargos"] });
      // 🔴 A SEGUNDA invalidação é o ponto. Desde a etapa 6 a listagem e a ficha de
      // candidatos exibem `cargos.nome` por join embutido — sem invalidar `candidatos`, o
      // usuário renomeia, volta para a lista e continua vendo o nome ANTIGO, concluindo
      // que o rename não funcionou. Mesmo motivo pelo qual `useEditais` invalida `provas`.
      queryClient.invalidateQueries({ queryKey: ["candidatos"] });
      toast({ title: "Cargo renomeado" });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro ao renomear cargo",
        description: mensagemErroCargo(error.message),
        variant: "destructive",
      });
    },
  });

  return { atualizarCargo: mutation.mutateAsync, isAtualizando: mutation.isPending };
}

/**
 * Exclui um cargo.
 *
 * ⚠️ DUAS FKs apontam para `cargos`, e elas são OPOSTAS de propósito:
 *   - `candidatos.cargo_id` é RESTRICT → cargo em uso NÃO é excluível. O banco é quem
 *     barra; não há pré-check no cliente, e é assim que tem de ser (um "leio e então
 *     decido" seria uma corrida, e a mensagem do banco nomeia o obstáculo melhor).
 *   - `cargo_apelidos.cargo_id` é CASCADE → os apelidos somem JUNTO, em silêncio.
 *     Quem chama tem de avisar antes: é a memória de pré-preenchimento das próximas
 *     importações que está indo embora.
 */
export function useExcluirCargo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("cargos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cargos"] });
      // Os apelidos foram junto por CASCADE — a query deles está velha.
      queryClient.invalidateQueries({ queryKey: ["cargo_apelidos"] });
      toast({ title: "Cargo excluído" });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro ao excluir cargo",
        description: mensagemErroCargo(error.message),
        variant: "destructive",
      });
    },
  });

  return { excluirCargo: mutation.mutateAsync, isExcluindo: mutation.isPending };
}

/** Um par "texto da planilha → cargo escolhido", como o passo 3 produz. */
export interface ApelidoParaSalvar {
  texto_origem: string;
  cargo_id: string;
}

/**
 * Grava a memória dos apelidos ao fim do passo Cargos.
 *
 * ⚠️ Aqui o upsert é `merge-duplicates` (o padrão), ao contrário de `useCriarCargo` — e a
 * assimetria é a decisão, não descuido. Lá, sobrescrever apagaria o nome canônico de um
 * cargo em uso; aqui, sobrescrever é justamente o que se quer: se o usuário reassociar uma
 * grafia a outro cargo, a decisão NOVA vence a antiga. Verificado no banco: o upsert
 * atualiza a linha em vez de criar uma segunda, que seria um apelido ambíguo.
 *
 * Um lote só, e não uma requisição por par: são ~9 apelidos, mas mandar em lote também
 * torna a gravação atômica dentro do bloco — ou entram todos, ou nenhum.
 */
export function useSalvarApelidos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (pares: ApelidoParaSalvar[]) => {
      if (pares.length === 0) return;

      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id ?? null;

      const { error } = await supabase.from("cargo_apelidos").upsert(
        pares.map((p) => ({
          texto_origem: p.texto_origem.trim(),
          cargo_id: p.cargo_id,
          created_by: createdBy,
        })),
        { onConflict: "texto_chave" },
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cargo_apelidos"] });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro ao guardar a associação dos cargos",
        description: mensagemErroCargo(error.message),
        variant: "destructive",
      });
    },
  });

  return {
    salvarApelidos: mutation.mutateAsync,
    isSalvando: mutation.isPending,
  };
}

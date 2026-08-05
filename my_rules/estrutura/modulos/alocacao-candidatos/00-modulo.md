# Módulo: Alocação de Candidatos

> **Contrato do módulo.** Este arquivo deve bastar para implementar ou refatorar o módulo sem reler o codebase. Se faltou algo, o defeito é deste doc — corrija-o junto com o código. Ver [`../../00-indice.md`](../../00-indice.md).

Módulo criado em **2026-08-04**. É a feature que o backlog de Candidatos previa como *"nova, com desenho próprio"* (item 1): o vínculo candidato ↔ prova/sala, que até então **não existia** no modelo.

## Identidade

| | |
|---|---|
| **`id`** em `src/lib/modulos.ts` | `alocacao-candidatos` |
| **Nome na UI** | Alocação de Candidatos |
| **Papéis com acesso** | `superadmin`, `admin` — **não** coordenador |
| **Rota de entrada** | `/alocacao-candidatos` (fixa) |
| **`prefixosRota`** | `['/alocacao-candidatos']` — cobre `/alocacao-candidatos/:provaId` pela regra prefixo + `/` |
| **`navLinks`** | Alocação → `/alocacao-candidatos` (`showFor: ['admin','superadmin']`) |
| **Ícone** | `DoorOpen` (lucide) |

### Rotas e guards

| Rota | Página | `papeis` no `RequireAcesso` |
|---|---|---|
| `/alocacao-candidatos` | `AlocacaoCandidatos.tsx` | `["admin"]` |
| `/alocacao-candidatos/:provaId` | `AlocacaoCandidatosProva.tsx` | `["admin"]` |

Só admin, pela mesma razão de Candidatos: a alocação só faz sentido junto do **nome do inscrito**, que é PII fechada em admin. A RLS de `candidatos_alocacao` fecha no mesmo papel.

## O que o módulo é

Distribuir os **inscritos** (`candidatos`) de um edital nas **salas** de uma prova (`salas_prova_distribuidas` — o snapshot, nunca o template `sala_prova`). O resultado é a tabela `candidatos_alocacao`: uma linha por (prova, candidato), apontando a sala.

**As cinco decisões do usuário (2026-08-04) que governam tudo:**

1. **A distribuição é POR CARGO**, alfabética por nome dentro do cargo (nº de inscrição desempata homônimos), percorrendo as salas na ordem física.

   ⚠️ **Mudou em 2026-08-05 (migration `20260805185155`).** Até 04/08 era **automática e global**: um botão varria TODAS as salas da prova de uma vez, na ordem `unidade → andar → número`, e o admin não escolhia nada. Agora **quem escolhe a unidade de cada cargo é o admin, arrastando** — e a RPC percorre só as salas *daquela* unidade. A regra por cargo não mudou; mudou o **pool de salas**. O botão "Distribuir automaticamente" e a RPC `distribuir_candidatos_da_prova` **não existem mais**.
2. **Cargo novo abre sala nova.** A sala de fronteira fica com vagas **ociosas** — salas não se dividem entre cargos (decidido pensando na logística de cadernos de prova diferentes). Consequência: a capacidade total precisa **sobrar**; a guarda `AL004` nomeia o cargo em que faltou espaço.
3. **Atendimento especial fica FORA do automático.** Quem tem `sala_especial` preenchida OU `portador_deficiencia = true` não entra na distribuição; a tela lista os pendentes **com o texto do pedido** e eles entram **à mão**. A definição de "especial" é UMA — a função SQL `candidato_pede_atendimento_especial` — usada pela RPC de distribuição E pela de pendentes.
4. **Reimportar candidatos com alocação de pé é RECUSADO** (FK `RESTRICT`). Reimportar deixou de ser incondicionalmente seguro: com alocação existe, vira ação em dois passos conscientes (desfazer a alocação → reimportar). Ver "O que este módulo mudou nos vizinhos".
5. **Ajuste manual: incluir e retirar** um candidato de uma sala (`origem = 'manual'`). **Redistribuir apaga SÓ as automáticas e preserva o manual** — inclusive os especiais alocados à mão. "O que você fez à mão, só você desfaz."

## Arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260804225156_alocacao_de_candidatos_em_salas.sql` | A tabela, a FK composta, os triggers, a RLS. ⚠️ A RPC de distribuição que ela criou foi **dropada** em 05/08 |
| `supabase/migrations/20260805185155_alocacao_por_plano_de_arrasto.sql` | O PLANO: `aplicar_plano_de_alocacao`, `cargos_pendentes_da_prova`, `contar_alocados_por_unidade`, e o `DROP` da distribuição global |
| `src/lib/alocacao-dnd.ts` + `.test.ts` (16 testes) | O rascunho: tipos, transições puras e `montarPlano`. Sem React, sem dnd-kit |
| `src/components/AlocacaoDragDropUI.tsx` | O quadro: `DndContext`, `pointerWithin`, o overlay e o "Aplicar plano" |
| `src/components/CargosPendentesDropzone.tsx` | 🔴 A faixa de pendentes é componente PRÓPRIO porque `useDroppable` precisa estar **dentro** do `DndContext` — ver "Pontos frágeis" |
| `src/components/{CargoDraggableCard,AlocacaoDraggableBadge,UnidadeDroppableCard}.tsx` | Visual puro + wrapper arrastável, separados de propósito (o clone do `DragOverlay` não pode registrar o mesmo id) |
| `docs/bateria-alocacao-candidatos.sql` | **A verificação real** — 10 casos com controle positivo, afirmando SQLSTATE e o NOME de quem barrou. A suíte mocka o Supabase e não alcança nada disto |
| `src/lib/alocacao-candidatos.ts` + `.test.ts` | A parte pura: `mensagemErroAlocacao` (traduz o 23505 da chave e a RLS; o resto passa intacto porque o banco já explica) |
| `src/hooks/useAlocacaoCandidatos.tsx` | React Query: ocupação por sala, especiais, lista de uma sala, busca "onde está", e as mutations distribuir/incluir/retirar |
| `src/pages/AlocacaoCandidatos.tsx` | A porta: escolher a prova por card (edital, data, nº de inscritos) |
| `src/pages/AlocacaoCandidatosProva.tsx` | O quadro: resumo, busca, pendentes especiais, salas por unidade, os dois diálogos (ver sala / incluir especial) |
| `src/pages/AlocacaoCandidatosProva.ui.test.tsx` (7 testes) | O dever da TELA: números certos, congelamento explicado, confirmação do distribuir, vazios distintos, falha de ocupação como aviso |

## Modelo de dados

```
candidatos_alocacao
  id            uuid PK
  candidato_id  uuid NOT NULL → candidatos(id) ON DELETE RESTRICT   -- decisão 4
  sala_id       uuid NOT NULL ┐ FK COMPOSTA (sala_id, prova_id) →
  prova_id      uuid NOT NULL ┘   salas_prova_distribuidas(id, prova_id) RESTRICT
                                  (+ FK simples prova_id → provas RESTRICT)
  origem        text NOT NULL CHECK IN ('automatica','manual')
  created_at / created_by (DEFAULT auth.uid())
  UNIQUE (prova_id, candidato_id)      -- um candidato, UMA sala por prova
```

- **Sem `updated_at`, sem policy de UPDATE** — o ciclo de vida é DELETE + INSERT (precedente de `candidatos_relatorio_importacao`). O trigger cobre UPDATE mesmo assim, para psql e `service_role`.
- **A FK composta é metade da coerência de graça:** "a sala pertence à prova declarada" é declarativo, sem trigger e sem corrida. Exigiu o `UNIQUE (id, prova_id)` em `salas_prova_distribuidas` (`salas_prova_distribuidas_id_prova_key`).
- **O índice `(candidato_id)` não é zelo:** sem ele, o `DELETE` de 7 mil candidatos da troca total varreria esta tabela uma vez por linha para checar a FK.

### O que o banco garante (e a bateria prova)

| Barreira | Onde | SQLSTATE |
|---|---|---|
| Prova OU unidade finalizada congela incluir/retirar | trigger `check_candidato_alocacao` → `recusa_alocacao_se_finalizada` (espelho da de salas, mensagem própria) | `PF001` |
| Candidato tem de ser do edital da prova | mesmo trigger (a metade que a FK não expressa) | `AL005` |
| Sala lotada recusa — inclusive no meio de um INSERT em massa | mesmo trigger (count com `FOR UPDATE` na sala, que serializa inclusões concorrentes) | `AL006` |
| Capacidade da sala não desce abaixo da ocupação | trigger `check_sala_reducao_capacidade` em `salas_prova_distribuidas` | `AL007` |
| Sala de outra prova | FK composta `candidatos_alocacao_sala_prova_fkey` | `23503` |
| Duas salas para o mesmo candidato na mesma prova | `candidatos_alocacao_prova_candidato_key` | `23505` |
| Reimportar/excluir candidato alocado | FK `candidatos_alocacao_candidato_id_fkey` RESTRICT | `23503` |

⚠️ **A ordem dos triggers de salas é pelo NOME, e foi escolhida:** `check_sala_de_prova_finalizada` < `check_sala_reducao_capacidade` (alfabética), então prova finalizada responde `PF001` — a regra nova não ofusca a antiga. A bateria afirma quem barrou em cada caso.

⚠️ **O trigger de capacidade NÃO conflita com a renumeração** (`salvar_salas_distribuidas`): o passo 1 dela só toca `sala_numero` e o trigger só consulta ocupação quando `sala_capacidade` MUDA.

### As RPCs

| RPC | O quê | Recusas |
|---|---|---|
| `aplicar_plano_de_alocacao(p_prova_id, p_plano jsonb)` | Aplica o rascunho montado por arrasto: lista **ordenada** de `{cargo_id, unidade_id, quantidade}`. Laço pelas entradas, faixas cumulativas por window function, **ponteiro POR UNIDADE**; apaga só `origem='automatica'` antes | sem edital `AL001` · sem elegíveis `AL002` · sem sala com vaga `AL003` · não coube **nomeando cargo E unidade** `AL004` · plano inválido/vazio `AL008` · unidade fora da prova `AL009` · plano maior que o cargo `AL010` |
| `cargos_pendentes_da_prova(p_prova_id)` | A faixa de arrasto: por cargo, `a_distribuir` · `especiais` · `ja_alocados` · `total` | — |
| `contar_alocados_por_unidade(p_prova_id)` | Ocupação por unidade, separando `manuais` (que o plano preserva) do `total` | — |
| `contar_alocados_por_sala(p_prova_id)` | Ocupação por sala (PostgREST não agrega) | — |
| `especiais_da_prova(p_prova_id)` | TODOS os especiais, com a sala se já alocados (`sala_id` nulo = pendente). Anti-join não é exprimível em PostgREST | — |

🔴 **A ORDEM do plano é significativa.** Quando um cargo se divide entre unidades, a 1ª entrada leva os primeiros N alfabéticos e a 2ª os N seguintes. Dois planos com os mesmos blocos em ordens diferentes produzem salas diferentes — por isso o rascunho guarda `ordem` em cada bloco (`src/lib/alocacao-dnd.ts`) e `montarPlano` achata **antes** de ordenar.

🔴 **O ponteiro de "cargo novo abre sala nova" é POR UNIDADE, não global.** Um ponteiro global (o da RPC antiga) erra assim que o plano volta a uma unidade já usada. A bateria prova isso no CASO 3.

🔴 **`a_distribuir` NÃO desconta quem já está alocado pela distribuição** — só especiais e manuais. Aplicar um plano apaga `origem='automatica'` e reinsere, então quem está lá volta a estar disponível. Descontá-los abriria a tela com a faixa **vazia** numa prova já distribuída. Controle na bateria: CASO 0b.

⚠️ **Dividir um cargo entre unidades é o caso PRINCIPAL, não a borda.** Medido em 05/08: `DOCENTE II` tem 3.663 inscritos e a maior unidade tem 3.200 vagas — o maior cargo não cabe em nenhuma unidade sozinho. É por isso que o plano carrega **quantidade**, e não só o par cargo→unidade.

**As três são SECURITY INVOKER** — a RLS de admin vale dentro delas. A de distribuição tem **guarda explícita de admin no início**: sem ela, um não-admin veria a RLS devolver zero candidatos e a recusa mentiria o motivo ("não há candidatos a distribuir").

🔴 **Consequência para tela futura de coordenador:** para quem não é admin, TODAS as leituras deste módulo voltam **vazias sem erro**. Uma tela de coordenador que consumir estes hooks mostraria "0 alocados" com convicção — é a armadilha do painel `isAdmin &&` de `GerenciarProva`, agora com mais uma porta.

**Incluir/retirar manual é INSERT/DELETE direto via PostgREST** (o padrão dominante do repo): as barreiras são os triggers, e **não há pré-check no cliente** — pré-check é corrida, e é para ser removido, não estendido.

## Permissões

SELECT / INSERT / DELETE: `has_role(auth.uid(), 'admin')` — **sem policy de UPDATE** (nega por padrão). Verificado pela bateria: não-admin lê 0 linhas sem erro, INSERT recusado por 42501, e o superadmin puro (sem linha `admin`) **passa** pela hierarquia dentro do `has_role`.

## O que este módulo mudou nos VIZINHOS

1. **`mensagemErroImportacao` (`src/lib/candidatos-import.ts`) ganhou o ramo `candidatos_alocacao`** — e um ramo só cobre os TRÊS fluxos que apagam candidatos (troca total, excluir um, limpar edital), porque os três usam essa função. A mensagem manda desfazer a alocação e diz que a lista foi mantida.
2. **`mensagemErroDesvinculoUnidade` (`src/hooks/useProvaUnidades.tsx`) ganhou o segundo dependente**: desvincular unidade apaga as salas do snapshot, e a FK da alocação barra o DELETE. É o obstáculo INDIRETO de invariantes.md — o tradutor da tabela pai no mesmo passe.
3. **A promessa "reimportar é sempre seguro" do módulo Candidatos ganhou uma condição**: com alocação de pé, a troca é recusada ANTES de apagar qualquer coisa (a lista fica intacta — nesse sentido segue segura; o que muda é que deixa de ser um passo só).
4. **Cadeia de desbloqueio que nenhuma mensagem conta inteira:** prova finalizada com alocação → reabrir a prova → desfazer a alocação → reimportar → redistribuir → refinalizar. O doc é o único lugar onde a cadeia aparece completa.

## Fronteira do módulo — o que NÃO é daqui

- **A alocação de COLABORADORES** (`/gerenciar-colaboradores-prova`, `colaboradores_prova`) é outra coisa: colaborador é quem **aplica** a prova, candidato é quem a **faz**. Os nomes se parecem; as tabelas não se tocam.
- **As salas são o snapshot** (`salas_prova_distribuidas`), do módulo Aplicação de Provas — este módulo as **lê** e conta ocupação, mas quem as cria/edita/renumera é `/gerenciar-salas-distribuidas`.
- **Os candidatos são do módulo Candidatos** — este módulo os lê (via RLS de admin) e os referencia; nunca os escreve.

## O arrasto (dnd-kit 6.3.1) — quatro armadilhas que já custaram tempo

Levantadas em 05/08 ao acoplar o protótipo. Todas falham **em silêncio**, sem erro no console:

1. 🔴 **`useDroppable` fora do `<DndContext>` registra no vazio.** O hook lê `InternalContext`; fora do provider ele pega o `defaultInternalContext`, cujo `dispatch` é `noop`. Chamá-lo no mesmo componente que *renderiza* o `DndContext` não funciona — contexto React só alcança **descendentes**. Sintoma: aquele alvo nunca acende e `over` nunca aponta para ele. **Nunca mova o `useDroppable` de `CargosPendentesDropzone` para o pai.**
2. 🔴 **O clone do `DragOverlay` não pode chamar `useDraggable`.** Dois draggables com o mesmo `id` — e o `Map` de nós é por id, então o clone sobrescreve a origem. Daí a separação visual (`CargoCard`) × arrastável (`CargoDraggableCard`).
3. ⚠️ **`closestCenter` não serve com droppable aninhado.** O bloco mora dentro do card da unidade, que disputa cada movimento por distância de centro. Use `pointerWithin` com queda para `closestCenter`. **`collisionPriority` NÃO existe no `@dnd-kit/core` 6.3.1** — é API do dnd-kit novo, e é a solução mais citada na web.
4. ⚠️ **Com `DragOverlay`, não aplique `transform` no nó de origem** — quem se move é o clone; aplicar nos dois soma deslocamento.

## Pontos frágeis conhecidos

- **O rascunho vive em MEMÓRIA e some no refresh** (decisão D4). Persistir exigiria tabela nova; com 9 cargos o replanejamento custa poucos arrastos. O quadro também **remonta** (via `key`) quando os números do banco mudam — um rascunho sobre números velhos descreveria um mundo que já mudou.
- **Mover um bloco entre unidades é no-op deliberado.** O código está pronto para receber (`handleDragEnd` já é exaustivo), mas o par `alocado → unidade` não faz nada.
- **A ordem física das salas** (andar → número) está duplicada entre a RPC e a exibição do quadro. Divergirem não corrompe nada, mas faz a tela mostrar os blocos "fora de ordem" em relação ao que o plano fez.
- **`useCandidatosDaSala` traz a sala inteira sem paginação** — decisão: sala física tem dezenas de lugares, o teto de 1.000 do PostgREST está longe. Se um dia existir "sala" de milhares, isso trunca calado.
- **A busca "onde está" filtra por embed** (`candidatos!inner` + `.or(..., { referencedTable })`) e limita a 20 resultados — é localizador, não listagem.
- **Redistribuir com pendência de capacidade não é incremental**: a RPC recusa o cargo inteiro que não coube (`AL004`) e desfaz tudo. É "ou tudo, ou nada" de propósito — distribuição parcial pareceria concluída.

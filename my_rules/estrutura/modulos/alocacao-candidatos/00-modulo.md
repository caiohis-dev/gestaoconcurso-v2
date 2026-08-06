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

**As decisões do usuário que governam tudo** — as cinco de 2026-08-04 e a sexta de 05/08:

1. **A distribuição é POR CARGO**, alfabética por nome dentro do cargo (nº de inscrição desempata homônimos), percorrendo as salas na ordem física.

   ⚠️ **Mudou em 2026-08-05 (migration `20260805185155`).** Até 04/08 era **automática e global**: um botão varria TODAS as salas da prova de uma vez, na ordem `unidade → andar → número`, e o admin não escolhia nada. Agora **quem escolhe a unidade de cada cargo é o admin, arrastando** — e a RPC percorre só as salas *daquela* unidade. A regra por cargo não mudou; mudou o **pool de salas**. O botão "Distribuir automaticamente" e a RPC `distribuir_candidatos_da_prova` **não existem mais**.
2. **Cargo novo abre sala nova.** A sala de fronteira fica com vagas **ociosas** — salas não se dividem entre cargos (decidido pensando na logística de cadernos de prova diferentes). Consequência: a capacidade total precisa **sobrar**; a guarda `AL004` nomeia o cargo em que faltou espaço.

   🔴 **A CAPACIDADE ÚTIL É MENOR QUE A SOMA DAS CAPACIDADES, e a tela tem de simular isso.** Bug real de 2026-08-05, com captura de tela: na unidade CGV (16 salas × 30 = **480**), o quadro deixou montar `GEOGRAFIA 322` + `L.INGLESA-PCD 6` + `DOCENTE II 152` = 480 exatos, e o banco recusou com `AL004` dizendo que restavam **120**. As 32 de diferença eram sobra de duas salas de fronteira (8 na 11ª, 24 na 12ª). A UI fazia `vagasTotais − alocados`; o banco conta **do ponteiro em diante**.

   **`simularEmpacotamento` (`src/lib/alocacao-dnd.ts`) é a tradução fiel do laço da RPC** e por isso `UnidadeAlocavel` guarda as **salas uma a uma**, não um total. Divergirem faz a tela voltar a aceitar plano que o banco recusa.

   ⚠️ **Crescer um bloco que já está na unidade NÃO exige sala nova** — a regra separa blocos *diferentes*. É `maxAdicionavelAoBloco`, não `vagasRestantes`, e ele faz busca binária porque crescer um bloco **empurra os seguintes**: a resposta não é uma subtração.
3. **Cada cargo tem TRÊS blocos arrastáveis: comuns, PCD e sala especial.** Todos entram no plano.

   🔴 **Os três são DISJUNTOS, e o desempate é decisão (2026-08-05): quem tem texto de pedido vai para `sala_especial` MESMO SENDO PCD.** O texto (*"sala térrea e ledor"*) é o que decide a sala; enterrá-lo no bloco genérico de PCD esconderia o pedido de quem monta a logística. Sem o desempate, quem fosse os dois seria **contado duas vezes** e o plano tentaria alocá-lo em duas salas. A definição é UMA — a função SQL **`bloco_do_candidato`**, coerente por construção com `candidato_pede_atendimento_especial` (`bloco <> 'comum'` ⟺ pede atendimento). Medido em 05/08: 122 PCD, 0 com `sala_especial`, **0 sobreposição** — o bloco de sala especial nasce vazio, mas a regra precisa existir antes de encher.

   ⚠️ **Mudou em 2026-08-05 (migration `20260805193931`).** Até então os especiais ficavam **fora** do automático e entravam **um a um, à mão**. Agora o plano também os coloca — mas *colocar não é conferir*. O pedido individual continua sendo trabalho de gente, e é por isso que `especiais_da_prova` devolve **`origem`**: `manual` = alguém leu o pedido e escolheu a sala; `automatica` = o plano o pôs numa sala e **ninguém conferiu**; `null` = pendente. **Fundir os dois primeiros daria por resolvido o que não está** — a tela mostra três estados, não dois.

   🔵 De graça: como cada entrada do plano abre sala nova na unidade, **PCD e sala especial sempre ganham sala própria** — e separada uma da outra.

   ⚠️ **Bloco vazio NÃO some da tela**, e os DOIS ZEROS dizem coisas opostas. A faixa mostra um container por cargo com os três cards sempre presentes, e `estadoDoBloco` (em `alocacao-dnd.ts`) decide qual texto:

   | Situação | Card | Significado |
   |---|---|---|
   | `naoAlocados > 0` | o número, arrastável | há gente a distribuir |
   | `total === 0` | **"sem inscritos"**, tracejado | o cargo nunca teve ninguém nesse bloco |
   | `total > 0 && naoAlocados === 0` | **"todos alocados"**, verde com ✓ | havia gente e ela já está no rascunho |

   É por isso que `CargoPendente` tem **`total`**, que **não desce com o arrasto**. Sem ele os dois zeros são o mesmo número e a tela mente num deles — fazendo procurar candidatos que não existem, ou achar que perdeu os que acabou de distribuir. Aconteceu de verdade em 05/08: o card de sala especial **sumiu** porque o dado real tem 0 com pedido escrito e um filtro `> 0` o escondia.
4. **Reimportar candidatos com alocação de pé é RECUSADO** (FK `RESTRICT`). Reimportar deixou de ser incondicionalmente seguro: com alocação existe, vira ação em dois passos conscientes (desfazer a alocação → reimportar). Ver "O que este módulo mudou nos vizinhos".
5. **Ajuste manual: incluir e retirar** um candidato de uma sala (`origem = 'manual'`). **Redistribuir apaga SÓ as automáticas e preserva o manual** — inclusive os especiais alocados à mão. "O que você fez à mão, só você desfaz."

6. **RETIRAR DA ALOCAÇÃO AUTOMÁTICA** (2026-08-05, migration `20260805205719`). Cada inscrito tem um marcador booleano por prova: quem está marcado sai dos três contadores de blocos **na hora** e o plano deixa de colocá-lo.

   🔴 **A chave é `(prova_id, candidato_id)`, e isso foi MEDIDO**: o Edital 001 tem **duas** provas. Uma coluna em `candidatos` faria "retirar do automático" na prova A retirar também na prova B, **em silêncio**.

   🔴 **Marcar NÃO mexe em sala** (decisão D1). Os contadores caem na hora, mas a alocação que a pessoa já tenha só é desfeita no próximo **"Aplicar"** — a regra de que só o Aplicar escreve em sala continua valendo. Entre marcar e aplicar existe um estado real: alguém **em sala e marcado para sair**. É por isso que `cargos_pendentes_da_prova` devolve **`fora_com_sala`** e a tela exibe um aviso — sem ele o total de alocados mente por omissão.

   🔴 **Alocação MANUAL e marcação são MUTUAMENTE EXCLUSIVAS** (migration `20260806011211`). As duas dizem a mesma coisa — *"o plano não mexe nesta pessoa"* —, já que aplicar um plano só apaga `origem='automatica'`. Duas metades, porque uma sozinha deixa a porta aberta:

   | Caminho | O que acontece |
   |---|---|
   | Incluir alguém numa sala à mão | o trigger `alocacao_manual_limpa_marcacao` **apaga** a marcação dele |
   | Marcar quem já está em sala à mão | recusado com **`AL011`** |

   ⚠️ **Só vale para `origem='manual'`.** Alocação automática NÃO limpa marcação: o plano insere milhares de linhas de uma vez, e quem está marcado nem entra nele — limpar ali apagaria marcação que ninguém pediu para tirar (controle 16i.3 da bateria).

   ⚠️ **A regra é "enquanto houver alocação manual", não "para sempre"**: retirada a pessoa da sala, ela volta a `a_distribuir` e marcar faz sentido de novo (controle 16i.4).

   Na tela, o switch fica **desabilitado e em falso** nesses casos, com tooltip explicando. Isso é conveniência — a barreira são os dois triggers.

   ⚠️ **`sem_sala` e `fora_do_automatico` são retornos SEPARADOS** de `aplicar_plano_de_alocacao`. "Não coube no plano" e "você tirou" são coisas diferentes; somá-las mandaria a pessoa procurar espaço para gente que ela mesma excluiu.

## Arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260804225156_alocacao_de_candidatos_em_salas.sql` | A tabela, a FK composta, os triggers, a RLS. ⚠️ A RPC de distribuição que ela criou foi **dropada** em 05/08 |
| `supabase/migrations/20260805185155_alocacao_por_plano_de_arrasto.sql` | O PLANO: `aplicar_plano_de_alocacao`, `cargos_pendentes_da_prova`, `contar_alocados_por_unidade`, e o `DROP` da distribuição global |
| `supabase/migrations/20260805193931_especiais_entram_no_plano.sql` | Os TRÊS blocos: `bloco_do_candidato` (a regra de desempate), `rotulo_do_bloco`, e `especiais_da_prova` passa a devolver `origem` |
| `supabase/migrations/20260805205719_candidatos_fora_do_automatico.sql` | O marcador: a tabela, seu trigger, os contadores descontando os marcados, e `candidatos_da_prova` (a listagem paginada) |
| `supabase/migrations/20260806011211_alocacao_manual_limpa_marcacao.sql` | Alocação manual e marcação viram mutuamente exclusivas: o trigger que limpa e o `AL011` que recusa |
| `src/components/ListaDeCandidatosDaProva.tsx` | A seção de baixo: TODOS os inscritos, paginados, com busca, filtro por cargo e por "somente sem sala", o switch de retirar e o ícone+tooltip do pedido |
| `src/components/IncluirEmSalaDialog.tsx` | Partir da PESSOA e escolher a sala com vaga. ⚠️ Saiu e voltou em 05/08 — ver "Duas portas para incluir à mão" |
| `src/lib/alocacao-dnd.ts` + `.test.ts` (30 testes) | O rascunho: `BlocoCargo`, `idDoBloco`, `agruparPorCargo`, `montarPlano`, `estadoDoBloco` e — o mais delicado — `simularEmpacotamento` / `maxAdicionavelAoBloco`. Sem React, sem dnd-kit |
| `src/components/AlocacaoDragDropUI.tsx` | O quadro em DUAS COLUNAS (cargos à esquerda, unidades à direita): `DndContext`, `pointerWithin`, o overlay e o "Aplicar plano" |
| `src/components/CargosPendentesDropzone.tsx` | Metade ESQUERDA: um container por cargo com os 3 cards. 🔴 É componente PRÓPRIO porque `useDroppable` precisa estar **dentro** do `DndContext` — ver as armadilhas do arrasto |
| `src/components/UnidadesDropzone.tsx` | Metade DIREITA: envolve os cards de unidade. ⚠️ PRESENTACIONAL — quem recebe o arrasto é cada card, nunca o container (soltar "nas unidades" seria ambíguo e disputaria a colisão com os filhos) |
| `src/components/{CargoDraggableCard,AlocacaoDraggableBadge,UnidadeDroppableCard}.tsx` | Visual puro + wrapper arrastável, separados de propósito (o clone do `DragOverlay` não pode registrar o mesmo id) |
| `docs/bateria-alocacao-candidatos.sql` | **A verificação real** — 21 casos (com subcasos) e controle positivo, afirmando SQLSTATE e o NOME de quem barrou. A suíte mocka o Supabase e não alcança nada disto |
| `src/lib/alocacao-candidatos.ts` + `.test.ts` (9 testes) | A parte pura: `mensagemErroAlocacao` e `agruparSalasComVagaPorUnidade` (a ordem física do seletor de salas) |
| `src/hooks/useAlocacaoCandidatos.tsx` | React Query: ocupação por sala e por unidade, cargos da prova, especiais, lista de uma sala, busca "onde está", e as mutations aplicar-plano/incluir/retirar |
| `src/pages/AlocacaoCandidatos.tsx` | A porta: escolher a prova por card (edital, data, nº de inscritos) |
| `src/pages/AlocacaoCandidatosProva.tsx` | A tela: resumo, avisos, o quadro de arrasto, busca "onde está", a lista de todos os candidatos e as salas por unidade |
| `src/pages/AlocacaoCandidatosProva.ui.test.tsx` (15 testes) | O dever da TELA: números certos, os TRÊS blocos por cargo, bloco zerado que não some, congelamento explicado, arrastar-não-grava, filtro no servidor, o marcador desabilitado em quem está em sala à mão |

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

```
candidatos_fora_do_automatico                     -- decisão 6 (05/08)
  prova_id      uuid ┐ PK COMPOSTA → provas(id) RESTRICT
  candidato_id  uuid ┘             → candidatos(id) ON DELETE CASCADE
  created_at / created_by (DEFAULT auth.uid())
  + índice em (candidato_id)
```

- 🔴 **`candidato_id` é CASCADE, contra o padrão do repo** (CLAUDE.md §2 manda RESTRICT por omissão). É exceção consciente: a linha é uma **anotação sem valor próprio** — sem o candidato ela não significa nada, e RESTRICT bloquearia a reimportação **inteira** do edital, pior que hoje.
- ⚠️ **O preço da CASCADE é perda silenciosa:** a troca total apaga os candidatos e os recria com ids **novos**, então as marcações somem e não teriam como ser preservadas. A mitigação **não é uma mensagem de erro** (não há erro): é o aviso **antes**, na confirmação da importação, contando quantas serão perdidas. Se um dia a FK virar RESTRICT, `mensagemErroImportacao` passa a precisar de um ramo.
- **O índice em `candidato_id` não é zelo:** a PK começa por `prova_id` e não serve ao `DELETE` em massa da troca total, que filtra por candidato.
- **Sem policy de UPDATE:** a linha existe ou não existe.

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
| Prova finalizada congela **marcar/desmarcar** "fora do automático" | trigger `check_candidato_fora_do_automatico` | `PF001` |
| Marcar quem já está em sala **à mão** | mesmo trigger (migration `20260806011211`) | `AL011` |
| Marcar candidato de outro edital | mesmo trigger (só no INSERT — no DELETE prenderia a linha para sempre) | `AL005` |

⚠️ **A ordem dos triggers de salas é pelo NOME, e foi escolhida:** `check_sala_de_prova_finalizada` < `check_sala_reducao_capacidade` (alfabética), então prova finalizada responde `PF001` — a regra nova não ofusca a antiga. A bateria afirma quem barrou em cada caso.

⚠️ **O trigger de capacidade NÃO conflita com a renumeração** (`salvar_salas_distribuidas`): o passo 1 dela só toca `sala_numero` e o trigger só consulta ocupação quando `sala_capacidade` MUDA.

### As RPCs

| RPC | O quê | Recusas |
|---|---|---|
| `aplicar_plano_de_alocacao(p_prova_id, p_plano jsonb)` | Aplica o rascunho montado por arrasto: lista **ordenada** de `{cargo_id, unidade_id, quantidade, bloco}`. Quem está marcado como "fora do automático" NÃO entra. Laço pelas entradas, faixas cumulativas por window function, **ponteiro POR UNIDADE**; apaga só `origem='automatica'` antes | sem edital `AL001` · sem elegíveis `AL002` · sem sala com vaga `AL003` · não coube **nomeando cargo E unidade** `AL004` · plano inválido/vazio `AL008` · unidade fora da prova `AL009` · plano maior que o cargo `AL010` |
| `cargos_pendentes_da_prova(p_prova_id)` | A faixa de arrasto: por cargo, os TRÊS blocos (`a_distribuir` · `pcd_a_distribuir` · `sala_especial_a_distribuir`) + `especiais` · `ja_alocados` · **`fora_do_automatico`** · **`fora_com_sala`** · `total` | — |
| `candidatos_da_prova(prova, busca, cargo, pagina, por_pagina, sem_sala)` | A listagem paginada de TODOS os inscritos, com o bloco calculado, a sala e o marcador. `total` por window function | — |
| `contar_alocados_por_unidade(p_prova_id)` | Ocupação por unidade, separando `manuais` (que o plano preserva) do `total` | — |
| `contar_alocados_por_sala(p_prova_id)` | Ocupação por sala (PostgREST não agrega) | — |
| `especiais_da_prova(p_prova_id)` | TODOS os especiais, com a sala se já alocados (`sala_id` nulo = pendente). Anti-join não é exprimível em PostgREST | — |

🔴 **A ORDEM do plano é significativa.** Quando um cargo se divide entre unidades, a 1ª entrada leva os primeiros N alfabéticos e a 2ª os N seguintes. Dois planos com os mesmos blocos em ordens diferentes produzem salas diferentes — por isso o rascunho guarda `ordem` em cada bloco (`src/lib/alocacao-dnd.ts`) e `montarPlano` achata **antes** de ordenar.

🔴 **O ponteiro de "cargo novo abre sala nova" é POR UNIDADE, não global.** Um ponteiro global (o da RPC antiga) erra assim que o plano volta a uma unidade já usada. A bateria prova isso no CASO 3.

🔴 **Os três `a_distribuir` NÃO descontam quem já está alocado pela distribuição** — só especiais e manuais. Aplicar um plano apaga `origem='automatica'` e reinsere, então quem está lá volta a estar disponível. Descontá-los abriria a tela com a faixa **vazia** numa prova já distribuída. Controle na bateria: CASO 0b.

🔴 **Todo filtro da listagem vai ao SERVIDOR** — cargo, busca e "somente sem sala". Filtrar no cliente deixaria o `total` (e a paginação) falando do conjunto inteiro enquanto a tabela mostra um subconjunto: a tela prometeria páginas que não existem e **mentiria sem quebrar nada**. É a mesma lição que `useCandidatos` já carrega.

⚠️ **Existem DUAS listagens de inscritos** e elas não podem divergir: `useCandidatos` (em `/candidatos`) e `candidatos_da_prova` (aqui). As regras de busca são deliberadamente idênticas — nome, inscrição ou CPF, `%` nas duas pontas, cargo exato, ordem por nome. Mexer numa sem a outra faz duas telas discordarem sobre quem é "o inscrito".

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
5. **A confirmação da importação passou a contar as marcações que serão perdidas** (`useMarcacoesDoEdital`). A contagem atravessa **todas as provas do edital** de propósito: a troca total apaga os candidatos das duas de uma vez, e contar só a prova aberta prometeria uma perda menor que a real.

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

## Duas portas para incluir à mão — e por que as duas existem

| Porta | Sentido | Serve a |
|---|---|---|
| **`IncluirEmSalaDialog`** (botão `+` na linha da lista) | da **PESSOA** para a sala | quem tem um pedido na mão (*"sala térrea e ledor"*) e precisa de uma sala que o atenda |
| **`SalaDialog`** ("Ver sala" → buscar → Incluir) | da **SALA** para a pessoa | quem está conferindo uma sala específica |

Na linha da lista, os dois botões são **excludentes**: quem não tem sala ganha o `+` (incluir), quem tem ganha o `−` (retirar). Nunca os dois.

🔴 **O que o `−` PROMETE depende da `origem`, e o tooltip diz qual:**

| `origem` | Retirar significa | Para tirar de vez |
|---|---|---|
| `manual` | **definitivo** — a pessoa foi colocada à mão | é só retirar |
| `automatica` | vale **até o próximo "Aplicar"**, que a recoloca | usar o switch "Retirar da alocação automática" na mesma linha |

Sem essa distinção o mesmo botão prometeria a mesma coisa em dois casos opostos, e metade das pessoas voltaria para a sala sem ninguém entender por quê. É por isso que `candidatos_da_prova` devolve `alocacao_id` **e** `origem`: o primeiro para conseguir retirar sem uma segunda consulta, o segundo para não mentir.

⚠️ **O primeiro saiu da tela em 2026-08-05 e voltou no mesmo dia.** Ele foi removido junto com o botão "Incluir em sala" da seção antiga — mas remover o botão não devia ter removido a **capacidade**. Sem ele, atender um pedido exigia adivinhar de antemão qual das **231 salas** é térrea e tem vaga, e fazer isso sem o texto do pedido à vista. O botão só aparece em quem **não tem sala**: incluir quem já tem é recusado pelo banco (`23505`).

## ⚠️ Provider ausente derruba a ÁRVORE, não o componente

O `Tooltip` do Radix lança **"Tooltip must be used within TooltipProvider"** e a página inteira fica **em branco** — não é o ícone que some. Funcionava por causa do provider na raiz do `App.tsx`, e foi o teste da tela que expôs a dependência de um ancestral distante.

**É a mesma família do `useDroppable` fora do `DndContext`:** componente que depende de um provider que ele não controla. Por isso o `TooltipProvider` de `ListaDeCandidatosDaProva` é **local** — providers aninhados são suportados e custam nada.

## Pontos frágeis conhecidos

- **O marcador "fora do automático" e a alocação podem discordar por um tempo.** Entre marcar alguém que já tem sala e aplicar o plano, ele está nos dois estados. É a decisão D1, e o único guarda-costas é o aviso de `fora_com_sala` na tela — se alguém remover o aviso, o número de alocados volta a mentir por omissão.
- **O rascunho vive em MEMÓRIA e some no refresh** (decisão D4). Persistir exigiria tabela nova; com 9 cargos o replanejamento custa poucos arrastos. O quadro também **remonta** (via `key`) quando os números do banco mudam — um rascunho sobre números velhos descreveria um mundo que já mudou.
- **Mover um bloco entre unidades é no-op deliberado.** O código está pronto para receber (`handleDragEnd` já é exaustivo), mas o par `alocado → unidade` não faz nada.
- 🔴 **A ordem física das salas vive em TRÊS lugares:** a RPC (`aplicar_plano_de_alocacao`), o quadro de arrasto e o seletor de `IncluirEmSalaDialog`. Divergirem não corrompe dado, mas faz a tela mostrar uma ordem que ninguém consegue seguir com a planta do prédio na mão.

  **A chave é `unid_nome`, nunca a sigla** — e a diferença é visível no dado real: por nome, `UGB — CENTRO UNIV. GERALDO DI BIASE` vem primeiro; por sigla viria quase no fim, depois de `CGV`, `CIEP 295` e `ICT`. Dentro da unidade: `sala_andar` com nulos por último, depois `sala_numero`.

  O seletor usa `agruparSalasComVagaPorUnidade` (`src/lib/alocacao-candidatos.ts`), que é **pura e testada** justamente porque ordenação regride em silêncio. O rótulo do grupo mostra **sigla E nome** — só a sigla faria a sequência parecer arbitrária, já que ela não é a chave da ordenação.
- **`useCandidatosDaSala` traz a sala inteira sem paginação** — decisão: sala física tem dezenas de lugares, o teto de 1.000 do PostgREST está longe. Se um dia existir "sala" de milhares, isso trunca calado.
- **A busca "onde está" filtra por embed** (`candidatos!inner` + `.or(..., { referencedTable })`) e limita a 20 resultados — é localizador, não listagem.
- **Redistribuir com pendência de capacidade não é incremental**: a RPC recusa o cargo inteiro que não coube (`AL004`) e desfaz tudo. É "ou tudo, ou nada" de propósito — distribuição parcial pareceria concluída.

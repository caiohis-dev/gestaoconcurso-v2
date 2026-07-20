# Roadmap — Edição de `colab_email` como operação sensível à identidade

> **Data:** 2026-07-15 (desenho) · **Etapa 1 implementada em 2026-07-16.** Reconciliar a edição de `colab_email` com o modelo de identidade do acesso do colaborador. Nasceu de um buraco achado ao montar a bateria de teste da 2B ([`../../docs/teste-frontend-auth-colaborador.md`](../../docs/teste-frontend-auth-colaborador.md)).
>
> **Estado (2026-07-16): as três etapas estão feitas.** A **Etapa 1** travou `colab_email` na UI; a **Etapa 2** entregou a EF `corrigir-email-acesso`, que **renomeia** a conta pendente (a mecânica mudou em relação ao desenho — ver a análise adiante); a **Etapa 3** são estas docs. A regra consolidada está em [`../estrutura/auth-e-permissoes.md`](../estrutura/auth-e-permissoes.md). **A bateria manual de UI (blocos `I` e `J` de [`../../docs/teste-frontend-auth-colaborador.md`](../../docs/teste-frontend-auth-colaborador.md)) rodou e passou em 2026-07-20**, e seguem dívidas abertas de propósito (estado C). Referências: o fluxo atual em [`concluidos/roadmap-auth-colaborador.md`](./concluidos/roadmap-auth-colaborador.md), o laudo em [`concluidos/fragilidades-auth-colaborador.md`](./concluidos/fragilidades-auth-colaborador.md), e as dívidas em [`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md).

## O problema

Depois da refatoração do acesso (etapas 1–3), `colab_email` acumulou **dois papéis** que antes coincidiam:

1. **Dado de contato** — um atributo da pessoa.
2. **Identidade de acesso** — a prova para reivindicar e, depois de reivindicado, o **login**.

Enquanto ninguém reivindicou, os dois coincidem. Assim que existe conta no Auth, quem manda no login é o **`auth.users.email`**, e `colab_email` vira só registro. **O dialog "Editar colaborador" (rota de gestão) edita `colab_email` como campo comum** — mas numa linha já vinculada isso dessincroniza cadastro e conta. Daí saem **dois sintomas do mesmo defeito**:

- **O caso travado:** e-mail digitado errado no cadastro → o invite cria a conta no e-mail errado e vincula `user_id`; a pessoa nunca recebe, nunca confirma; o coordenador corrige o `colab_email`, mas a conta órfã continua no endereço velho e o registro consta como "já vinculado" — e "esqueci minha senha" também iria ao e-mail errado. A pessoa fica **presa**.
- **A dívida de sequestro** ([`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md) §1): editar `colab_email` é, na prática, re-ancorar a identidade — num registro vinculado e confirmado, é **tomar o login de alguém**.

## Os três estados de uma linha de `colaboradores`

O que uma edição de e-mail significa **depende do estado da linha** em relação à conta do Auth:

| Estado | Situação | O que a edição significa | Comportamento desenhado |
|---|---|---|---|
| **A** | `user_id IS NULL` (nunca reivindicado) | Só muda para onde um futuro invite vai | ✅ **Livre** — é o caminho já desenhado para os 254 sem e-mail e para consertar typo *antes* de reivindicar |
| **B** | Vinculado, conta **não-confirmada** (invite criado, nunca clicado) | Dessincroniza: cadastro com e-mail novo, conta órfã no e-mail velho | ⚠️ **Lógica de reconciliação** — descartar a reivindicação pendente e re-ancorar no e-mail corrigido |
| **C** | Vinculado, conta **confirmada** (login ativo) | Reescreve o login de um usuário — o vetor de sequestro | 🚫 **Bloquear no dialog** — a troca pertence ao próprio dono, via o fluxo nativo do Auth |

## A decisão de fundo

**Editar `colab_email` deixa de ser edição de campo comum: passa a depender do estado (vinculação + confirmação).** Numa linha vinculada, `colab_email` não é dado livre — é a projeção do login, e **só o Auth pode alterá-lo com consistência**. Isso não é só política: um `UPDATE` cru vindo do dialog **não alcança** `auth.users` (exige o admin API / `service_role`), então o caminho normal de edição é *fisicamente incapaz* de manter cadastro e conta em sincronia numa linha vinculada.

## Decisões de desenho

1. **Estado A → livre.** Mantém o caminho desenhado na 2B (coordenador inclui/corrige e-mail antes da reivindicação). A dívida residual de sequestro *nesse* estado (janela do não-vinculado) **segue aceita e contida** por `user_id UNIQUE` + reivindicação só com `user_id IS NULL`.
2. **Estado B → lógica.** Editar o e-mail de uma linha vinculada-mas-pendente **descarta a conta nunca-usada** (`admin.deleteUser`; a FK `colaboradores.user_id` é **`ON DELETE SET NULL`**, então `user_id` volta a NULL sozinho) e **re-ancora** no e-mail novo pelo fluxo de invite existente. É a mecânica que resolve o caso travado — agora no lugar certo (consequência de uma edição deliberada, não gambiarra no reenvio).
3. **Estado C → bloquear.** Trocar o e-mail de um login ativo não é operação de coordenador: pertence ao **próprio dono**, via o fluxo nativo de troca de e-mail do Supabase Auth (dupla confirmação no endereço novo). O coordenador **não** recebe essa alavanca — é o que fecha o sequestro para contas confirmadas. Uma eventual **saída administrativa** (pessoa saiu, caixa morta) **fica como dívida anotada** ([`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md)), **não implementada**.
4. **Onde vive a lógica.** Toda alteração de e-mail em linha vinculada (B) roda por **Edge Function** com `service_role` — o único contexto que mantém `colaboradores` e `auth.users` consistentes.

## Como o dialog sabe o estado

`user_id` (na própria tabela `colaboradores`) já distingue **A** de **{B, C}** — suficiente para a Etapa 1 travar o campo. **Confirmado vs. pendente** (separar B de C) exige um lookup em `auth.users` (`email_confirmed_at` / `last_sign_in_at`), que só a Edge Function faz — é a Etapa 2.

## As etapas

- **Etapa 1 — Travar o campo na UI. ✅ FEITA em 2026-07-16** (detalhes na seção final). `colab_email` **read-only** em linha vinculada, no `ColaboradorDialog` **e** no `PerfilColaborador`. Autossuficiente e corta o risco mais grosseiro: coordenador re-ancorando linha vinculada por edição casual.
- **Etapa 2 — Ação deliberada de correção (estado B). ✅ FEITA em 2026-07-16** (detalhes abaixo). Edge Function "corrigir e-mail de acesso": recebe o colaborador vinculado, checa no Auth se a conta é **pendente**; se for, **renomeia** a conta e reenvia o link ao e-mail corrigido; se **confirmada**, recusa (cai no estado C). **A mecânica mudou** em relação a este desenho — era `deleteUser` + reinvite; ver a análise da troca adiante.
- **Etapa 3 — Reflexo nas docs.** Mover a invariante de "vinculado" para "confirmado" na dívida de sequestro; registrar o estado C como dívida (já feito neste ciclo); atualizar [`../estrutura/auth-e-permissoes.md`](../estrutura/auth-e-permissoes.md). **Parcialmente feita** junto com a Etapa 1 (as docs de `estrutura/` já refletem a trava); o que sobra aqui acompanha a Etapa 2.

**Ordem/dependência:** a Etapa 1 não depende de nada e já reduz risco; a Etapa 2 depende de detectar confirmado vs. pendente. A 3 acompanha as duas.

## Fatos técnicos que condicionam o desenho

- **`generateLink('invite')` cria a conta no `auth.users` na hora do "Primeiro acesso"** (não ao clicar o link), e o trigger `handle_new_user` vincula `user_id` no nascimento (migration `20260714201650`). **É por isso que o estado B existe.**
- **FK `colaboradores.user_id` é `ON DELETE SET NULL`:** apagar a conta pendente devolve `user_id` a NULL e destrava o fluxo de invite existente sem migration.
- **Postgres não tem RLS a nível de coluna.** Um bloqueio no banco do tipo "`authenticated` não altera `colab_email` de linha vinculada" seria via **trigger**, não policy. A decidir na implementação: se vale esse cinto-e-suspensório, ou se o read-only da UI + a ausência de um caminho de escrita consistente já bastam.

## Etapa 1 — o que foi implementado (2026-07-16)

**Só front. Nenhuma migration.** Arquivos: `src/hooks/useColaboradores.tsx`, `src/components/ColaboradorDialog.tsx`, `src/pages/PerfilColaborador.tsx`.

1. **`user_id` no tipo `Colaborador`.** A coluna já chegava ao front (todos os caminhos usam `select('*')`), mas o tipo não a declarava — por isso o dialog não tinha como saber o estado da linha. `ColaboradorInsert` a **exclui** do payload: quem preenche `user_id` é o trigger.
2. **`ColaboradorDialog`:** `isVinculado = !!colaborador?.user_id`. Quando verdadeiro, `colab_email` é read-only (fundo `bg-muted`, com nota), sai do payload do update e é **omitido da validação** (`colaboradorSchema.omit({ colab_email: true })`). O `omit` importa: o schema exige `colab_email` não-vazio, então validar o campo numa linha vinculada de e-mail nulo travaria o salvamento **do resto do cadastro**. `readOnly` em vez de `disabled` de propósito — o coordenador ainda precisa ler e copiar o endereço do login.
3. **`PerfilColaborador`:** `colab_email` read-only **incondicional**. A chamada de `update_meu_colaborador` segue passando `p_email`, mas com o valor carregado — no-op, porque o campo não muda mais.

### A ampliação de escopo (decidida em 2026-07-16)

O desenho original mandava travar **só o `ColaboradorDialog`**. Ao implementar, apareceu que o `PerfilColaborador` **também** editava `colab_email` como campo comum, via `update_meu_colaborador` (`colab_email = NULLIF(p_email, '')`, sem tocar `auth.users`). Como quem abre essa página está logado, a linha é **sempre** vinculada — é o estado C por definição. Travar só o dialog teria remetido a troca "ao próprio colaborador" apontando para uma porta que produzia exatamente a dessincronia que a etapa existe para impedir. **Decisão: travar os dois.** Consequência aceita: hoje ninguém troca e-mail de linha vinculada pela UI — a saída é a Etapa 2 (estado B) ou o dashboard do Auth (estado C).

### A decisão sobre o trigger

O ponto deixado em aberto no desenho ("vale o cinto-e-suspensório?") foi resolvido em **2026-07-16: não, por ora.** Um `BEFORE UPDATE` barrando `colab_email` em linha vinculada **fecharia junto o caminho da Etapa 2** — a Edge Function de reconciliação também faz `UPDATE` —, exigindo escape por `service_role` ou flag de sessão. Essa complexidade pertence à Etapa 2, que é quem precisa do escape. **O resíduo é conhecido:** a trava é de UI, a RPC ainda aceita `p_email` e a policy de UPDATE ainda alcança a coluna, então uma chamada direta ao PostgREST contorna. Registrado como dívida em [`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md).

### Verificação

`tsc --noEmit` e `npm run build` limpos; o lint não ganhou erro novo (os 14 são pré-existentes, `as any` de antes). Na época **não houve verificação pela UI** — o repo não tem infra de teste. Os casos manuais foram acrescentados à bateria em [`../../docs/teste-frontend-auth-colaborador.md`](../../docs/teste-frontend-auth-colaborador.md) (bloco `I`) e **foram rodados e aprovados em 2026-07-20**.

O banco local corrobora os três estados: **759 em A** (254 sem e-mail), **1 em B** e **12 em C**. A linha em B (`CAIO TESTE`) já está **dessincronizada** — `colab_email` `contato@caioteixeira.net.br` contra login `exemplo2@exemplo3.com`: o caso travado real, anterior à trava.

## Etapa 2 — por que a mecânica deixou de ser "apagar" e passou a ser "renomear" (2026-07-16)

> **Resolvido.** O desenho original (2026-07-15) mandava apagar a conta pendente e recriá-la pelo invite. Durante a implementação o usuário levantou que **a exclusão precisaria consultar as tabelas vinculadas ao usuário apagado e reassociá-las à conta nova** — e o levantamento mostrou que isso derrubava a mecânica. **A Etapa 2 passou a renomear a conta.** A análise abaixo fica registrada porque é ela que justifica a troca.

**O desenho tratou `admin.deleteUser` como se ele só zerasse `colaboradores.user_id`** (pela FK `ON DELETE SET NULL`). **Não é o que acontece.** Apagar a conta mexe em tudo que aponta para aquele `user_id` — e o desenho não olhou para essas tabelas nem para o que fazer com elas depois.

### O inventário real (medido no banco local, 2026-07-16)

FKs que referenciam `auth.users` — **15 colunas em 11 tabelas de `public`**, em três regimes:

| Regime | Colunas | O que o DELETE faz |
|---|---|---|
| **`SET NULL`** | `colaboradores.user_id` | ✅ o mecanismo desenhado: `user_id` volta a NULL |
| **`CASCADE`** | `profiles.id`, `user_roles.user_id`, `coordenadores_prova.user_id` | ⚠️ **apaga em silêncio** |
| **`NO ACTION`** | `colaboradores.created_by`, `provas.created_by`, `unidades_prova.created_by`, `sala_prova.created_by`, `prova_unidades.created_by`, `prova_unidades.unidade_finalizada_by`, `funcoes_colaboradores.created_by`, `colaboradores_prova.created_by`, `meta_colaboradores_unidade.created_by`, `coordenadores_prova.created_by`, `email_atualizacao_log.sent_by` | 🚫 **o DELETE falha** se houver qualquer linha |

Para a conta pendente do `CAIO TESTE`: `user_roles` **2** (`user`, `colaborador`), `profiles` **1**, `coordenadores_prova` 0, e **todos os 11 `created_by` em 0** — como previsto, uma conta que nunca logou nunca criou nada. É o caso feliz, e por isso ele **esconde** o problema.

### O que se perde em silêncio

- **`user_roles` (CASCADE).** Os papéis somem. `user` e `colaborador` **voltam por acidente** — o trigger `handle_new_user` os concede à conta nova. Mas um papel dado por um admin (**`coordenador`, `admin`, `superadmin`**) **não volta**: o trigger não sabe dele. A pessoa reentra rebaixada, sem aviso.
- **`profiles` (CASCADE).** O trigger recria a linha, mas com `full_name` vindo de `raw_user_meta_data ->> 'full_name'` — e **`generateLink('invite')` cria a conta sem `user_metadata`**. O `full_name` do perfil novo nasce **NULL**.
- **`coordenadores_prova` (CASCADE).** Se a conta pendente tiver alocação de coordenador (possível: a `create-coordenador` **reaproveita conta existente**), o DELETE leva as alocações junto. Hoje a EF **recusa** nesse caso — recusar não é reassociar, é só não estragar.

### O que a reassociação exigiria

1. **Antes do delete:** inventariar os vínculos (papéis além dos automáticos, `profiles.full_name`, linhas de `coordenadores_prova`).
2. **Depois do invite:** saber o **`user_id` novo** para reapontar tudo. **O helper `_shared/enviar-link-acesso.ts` devolve só `{ ok }`** e engole o objeto `user` que o `generateLink` retorna — então o helper **compartilhado** (usado também por `reivindicar-acesso` e `public-create-colaborador`) teria de mudar.
3. **Reaplicar:** reconceder os papéis extras, restaurar o `full_name`, reapontar `coordenadores_prova.user_id`.

**E o risco piora:** não há transação cobrindo a API do Auth + o banco. Se a reaplicação falhar no meio, sobra uma conta que **loga mas perdeu os poderes** — falha silenciosa, difícil de notar, e pior do que ter recusado a operação.

### A observação que isso força

**Todo esse trabalho existe só porque a mecânica apaga e recria.** Com `admin.updateUserById(user_id, { email, email_confirm: false })` o `user_id` **não muda** — e então *nada* se perde, por construção: sem inventário, sem reassociação, sem plumbing de id novo, sem falha parcial, e sem esbarrar nos 11 `NO ACTION`.

E o argumento que sustentou o delete **não sobrevive à inspeção**. Ele era: "se o typo caiu na caixa de um estranho, a conta nasceu no endereço DELE — apagar limpa, renomear só move a conta de um terceiro". Mas no estado B essa conta é **uma casca vazia**: não-confirmada, nunca logada, sem sessão, contendo apenas as linhas que o próprio trigger gerou (`profiles` + `user_roles`) — que seriam recriadas idênticas. **Não há nada do estranho lá dentro para "mover".** Se o estranho tivesse clicado e criado senha, a conta estaria **confirmada** (estado C) e a EF recusaria de qualquer forma.

**Custo do renomear:** o `invite` falha para conta existente, então o link é `recovery` (o helper fixava `'invite'`); e `profiles.email` precisa ser atualizado à mão (o trigger só o escreve no nascimento). **Duas linhas contra um protocolo de inventário-e-reassociação.**

**Decisão do usuário (2026-07-16): renomear.** É o que está implementado.

## Etapa 2 — o que foi implementado (2026-07-16)

**Arquivos:** `supabase/functions/corrigir-email-acesso/index.ts` (nova), `supabase/functions/_shared/enviar-link-acesso.ts` (ganhou o parâmetro `tipo`), `src/components/CorrigirEmailAcessoDialog.tsx` (nova), `src/components/ColaboradorDialog.tsx` (ponto de entrada). **Nenhuma migration.**

**Uma EF, dois modos.** `consultar` devolve o estado (A/B/C) + os dois endereços + `divergentes`; `corrigir` executa. O modo `consultar` existe porque separar B de C exige ler `auth.users`, e isso só acontece na EF — o front nunca vê o Auth. **Autorização:** espelha exatamente a policy de UPDATE de `colaboradores` (`has_role(admin) OR has_role(coordenador)`); como `has_role` é match literal, um superadmin sem linha `admin` não passa — igual à tabela.

**A mecânica do `corrigir`:** valida tudo que pode recusar **antes** de escrever (estado ≠ B, e-mail já de outro colaborador — o índice único é funcional sobre `lower(trim(...))` —, conta já existente no destino, e-mail igual ao da conta) → `admin.updateUserById(user_id, { email, email_confirm: false })` → atualiza `colab_email` → atualiza `profiles.email` → envia link `recovery`. A conta **continua pendente**: quem confirma é a pessoa, ao abrir o link no endereço novo — é a prova de posse da caixa.

**A comparação é contra o e-mail da CONTA, não contra `colab_email`.** O caso típico é justamente `colab_email` já corrigido por alguém e a conta parada no endereço velho — foi assim que o espécime local nasceu.

**Ordem das escritas, e por quê:** o rename vem primeiro. Se o `UPDATE colab_email` falhar depois dele, a conta já está no endereço certo e a pessoa entra por "esqueci minha senha" — sobra só a divergência cosmética, que é o que esta própria função conserta (basta repetir). Na ordem inversa, uma falha deixaria a pessoa sem acesso. `profiles.email` falhando **não** derruba a operação: é cópia de conveniência, a verdade do login é `auth.users.email`.

### Verificação (executada em 2026-07-16, contra o banco local)

A EF foi exercitada ponta a ponta por HTTP, com JWT de admin, **12 casos**: os três estados no `consultar` (B/C/A, classificados certo); as recusas — corrigir em C (409), em A (409), com e-mail de outro colaborador (409), com o e-mail que já é o da conta (400), e-mail inválido (400), sem JWT (401); a **correção real**; o `consultar` de novo (`divergentes` virou `false`); e a repetição (idempotente: 400).

**O resultado que importa** — antes → depois da correção real:

| Campo | Antes | Depois |
|---|---|---|
| `user_id` | `bee702b6…` | **`bee702b6…` — intacto** |
| `auth.users.email` | `exemplo2@exemplo3.com` | `contato@caioteixeira.net.br` |
| `profiles.email` | `exemplo2@exemplo3.com` | `contato@caioteixeira.net.br` |
| `user_roles` | `colaborador+user` | **`colaborador+user` — preservados** |
| `email_confirmed_at` | NULL | NULL — segue pendente, como deve |

**`user_id` e papéis sobreviveram — é o ponto inteiro do renomear.** O `generateLink('recovery')` **funciona em conta não-confirmada** (era a incerteza da mecânica nova): o único erro no log foi o `send-email` (`failed to lookup address information`), o SMTP que notoriamente não entrega local — e a EF reportou isso pelo caminho de `aviso`, com `ok:false`, sem fingir sucesso.

**O espécime foi restaurado** aos valores originais (`auth_email` e `profiles.email` de volta a `exemplo2@exemplo3.com`, `recovery_token` limpo), e o `consultar` confirma `divergentes: true` de novo — o `CAIO TESTE` continua disponível como caso de teste do estado B pela UI.

**A UI** (o `CorrigirEmailAcessoDialog`, o botão no `ColaboradorDialog`) **foi rodada e aprovada em 2026-07-20** — bloco `J` da bateria, os 7 casos. Segue sem teste só o **envio real do e-mail**, que localmente não sai (SMTP), e por isso o J3 fecha pelo toast de aviso, não pelo de sucesso.

## Ponto em aberto

**A Etapa 3 (docs) acompanha esta etapa e está feita para o que existe.** Segue de fora, por decisão: a **saída administrativa do estado C** (dono que perdeu a caixa) e o **fluxo nativo de troca de e-mail pelo próprio dono** — ver [`dividas-auth-colaborador.md`](./dividas-auth-colaborador.md) §1-bis. Segue também o **resíduo da Etapa 1**: a trava é de UI, sem trigger, então uma chamada direta ao PostgREST ainda re-ancora `colab_email` (§1). Quando isso fechar, este arquivo é arquivado em `concluidos/` (convenção da reorganização de 2026-07-15).

# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. **Item concluído sai daqui** — o registro completo dele (o que foi medido, a premissa errada, o que a decisão custou) vai para [`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md), e fica só uma linha na tabela abaixo. O que o sistema **é** vive em [`estrutura/`](./estrutura/).

> **Última auditoria contra o código: 2026-07-26**, com correções pontuais depois. 🔵 **Reorganizado em 2026-11-04:** os itens passaram a vir **em ordem de prioridade** (grupos P1 a P6 abaixo), os blocos ✅ que ainda moravam aqui foram para `concluidos/`, e as contagens que envelheceram foram corrigidas ou marcadas no próprio item.
>
> ⚠️ **Números envelhecem — confira na hora.** Este bloco já trazia dois errados: dizia **95 migrations** (são **106** em 31/07) e **`anon` ainda com `TRUNCATE` em 23 tabelas**, o que **deixou de valer** na mesma data — `anon` não tem privilégio nenhum em `public`. Em 2026-11-04 são **178 migrations** e, no banco local (cópia de produção), **821 colaboradores** (623 com chave PIX, **0** com `tipo_chave_pix`) — eram 771/565 em julho. ⚠️ As três FKs de `funcao_id` em `SET NULL`/`CASCADE`/`CASCADE` são afirmação de julho e **não foram remedidas** nesta revisão.

---

---

## Concluídos — o histórico saiu daqui

Os **15** blocos de temas fechados foram movidos em 2026-07-31 para
[`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md),
**na íntegra**. Eles ocupavam 65% deste arquivo e diluíam o que falta. 🔵 **Mais 7 foram em
2026-11-04** — seis ✅ que tinham ficado aqui "pelo que ensinam" e as pendências menores da
importação, todas fechadas; estão no fim daquele arquivo.

⚠️ **Não são só registro de pronto:** guardam o que foi medido, a premissa que estava
errada e o que cada decisão custou. Antes de reabrir qualquer tema abaixo, procure lá.

| Data | Tema |
|---|---|
| ✅ 26/07 | a fabricação de alocação falsa foi apagada por inteiro |
| ✅ 26/07 | as três regras que moravam só no cliente foram para o banco |
| ✅ 26/07 | segunda e terceira rodadas da auditoria de invariantes |
| ❌ 26/07 | os CPFs inválidos são trabalho do coordenador |
| ✅ 26/07 | a meta órfã deixou de ser possível |
| ✅ 26/07 | excluir função em uso passou a ser recusado pelo banco |
| ❌ 26/07 | exposição da `send-email` no projeto v1 |
| ✅ 27/07 | a chave natural de `candidatos` passou a incluir o CPF |
| ❌ 28/07 | o auto-pareamento estava CERTO; a leitura da planilha é que estava errada |
| ✅ 29/07 | Cargos como entidade: o cargo do candidato deixou de ser texto sujo |
| ✅ 30/07 | os `useEffect` do `GerenciarColaboradoresProva` saíram do jeito cru |
| ✅ 30/07 | dado inválido do candidato passou a ENTRAR como veio |
| ✅ 30/07 | o registro órfão deixou de ser possível: importar virou TROCA TOTAL |
| ✅ 31/07 | os grants de `anon` foram a zero, e a auditoria achou um vazamento de leitura |
| ✅ 31/07 | as duas pontas de infraestrutura de teste |
| ✅ 01/08 | a CG001 passou a trancar só por INSCRITO, não por apelido |
| ✅ 01/08 | o timbre dos PDFs virou `src/lib/pdf-timbre.ts`, dono único das três páginas |
| ✅ 01/08 | a importação passou a trazer **só quem pagou** a inscrição |
| ✅ 01/08 | a chave natural virou `(edital_id, n_inscricao)` — CPF e cargo saíram da identidade |
| ✅ 02/08 | o edital de uma prova virou **imutável** depois de definido (`PE001`) |
| ✅ 02/08 | o cadastro público passou a validar o CPF antes de consultar — e a EF perdeu um `padStart` que consultava outra pessoa |
| ✅ 02/08 | o nº de inscritos passou a ter **uma** fonte: a lista real. A alocação dizia 200 onde havia 7.231 |
| ✅ 04/08 | o candidato ganhou sala: módulo **Alocação de Candidatos** (o vínculo candidato↔prova/sala que o item 1 de Candidatos previa) |
| ✅ 05/08 | a distribuição virou **plano montado por arrasto**: o admin escolhe a unidade de cada bloco, os cargos ganharam 3 blocos (comuns/PCD/sala especial) e nasceu o marcador "fora da alocação automática" |
| ✅ 10/08 | o **banco de produção da v2** existe, carregado e **provado por login real** (`zugigdpuxbpogoepdawm`, us-west-2, plano free) |
| ✅ 13/08 | **a v2 FOI AO AR**: `https://fevre.online` responde por nginx com TLS, e o bundle publicado aponta para o Supabase de produção |
| ✅ 31/07–01/08 | as pendências menores da importação: fixture `CABECALHO_REAL` atualizado, `TRUNCATE` de `anon` revogado, e o trigger da 5b ficou sem objeto |
| ✅ 08/09 | `anon` deixou de alcançar **24 funções** por RPC — e a `verify_user_password`, que nunca conferia senha, foi dropada |
| ✅ 10/09 | `useFuncoesAssociadas`: 42,8 kB em 3 requisições viraram a RPC `funcoes_em_uso` (e a premissa "libera exclusão de função em uso" era falsa) |
| ✅ 12/09 | `finalizar_prova`/`reabrir_prova` e as `_unidade` passaram a ler `auth.uid()` em vez do `p_user_id` do chamador |
| ✅ 12/09 | o `.env` da raiz (que se chamava produção e apontava para o Docker) foi removido; a senha SMTP achada no `.env.local` foi **rotacionada** (confirmado pelo usuário em 04/11) |
| ✅ 16–17/09 | a **v3 do módulo Editais**: 11 das 12 fatias entregues, e as duas que faltavam viraram itens aqui embaixo |
| ✅ 20/09 | o carimbo de "Último Acesso" voltou a ser escrito (no login) e nasceu a trilha de envio do link (`log_envio_link_acesso`) |
| ✅ 21/09 | o defeito do `padStart` antes do `length` (fixo em 02/08 só na `check-cpf-colaborador`) sobrevivia em 3 outras EFs — `reivindicar-acesso`, `incluir-email-cadastro`, `public-create-colaborador`; consolidado em `_shared/cpf.ts` |
| ✅ 24/09 | módulo Financeiro (gerador CNAB240/PIX) acoplado por inteiro — papel + guarda de acesso, lógica de negócio portada e testada, e UI real conectada; persistência ficou fora por decisão (item novo abaixo) |
| ✅ 24/09 | papel de sistema passou a nascer de COLABORADOR: `create-admin` (que sobrescrevia a senha de quem já tinha conta) virou `conceder-papel-sistema`, e colaborador + financeiro passou a ver o hub — **no ar na v3.7.0**, com a `create-admin` apagada de produção |
| ✅ 24/09 | as ressalvas do "admin preenche o e-mail e o colaborador se reivindica": o teto do `acesso` folgou para 5/10 min com frase fixa (**v3.7.3**), e as 12 CHECKs de `colaboradores` passaram a chegar traduzidas no cadastro e na edição |
| ✅ 24/09 | o `PerfilColaborador` passou a mostrar a recusa do banco: a frase `P0001` das RPCs (que era descartada, inclusive a da duplicidade) e as CHECKs traduzidas — o ramo `23505` da tela nunca rodava |
| ✅ 24/09 | a `update_meu_colaborador` deixou de completar o CPF com zeros antes de conferir o tamanho (aceitava `123`, cortava 12 dígitos), ganhou dígito verificador na MUDANÇA e passou a nomear o campo duplicado — migration `20260925002742`, bateria `docs/bateria-update-meu-colaborador.sql` |
| ❌ 24/09 | o diálogo "Nova Ocorrência" em assistente de etapas — **não será feito**, decisão do usuário. A outra metade do item (a falta tirar o colaborador da lista da prova) já tinha entrado na v3.4.0 |
| ✅ 08/10 | o **fiscal de sala virou marcação da função** (`fiscal_de_sala` + trigger FS001/2/3; o seletor estava vazio desde sempre) e excluir a ocorrência devolve o posto — **no ar na v3.9.0** (03/11) |
| ✅ 03/11 | Financeiro: **pagamento em reais inteiros** (centavos ignorados, com aviso) e o fim da célula numérica lida 10× — **v3.9.0** |
| ✅ 03/11 | Financeiro: **nenhuma linha some calada** — recusadas listadas com motivo (valor estrito, chave PIX não reconhecida, CPF inválido), medido numa planilha real — **v3.9.1** e **v3.9.2**. Sobra o item de CPF/chave como número, prioridade baixa |
| ✅ 03/11 | **logout por inatividade** para todo usuário logado (30 min gestão, 5 min colaborador, aviso 1 min antes, conta por navegador, saída só deste navegador) — **v3.10.0** |

---

# P1 — Risco ativo e barato

Configuração de produção e correções de uma chamada. Nada aqui pede código grande.

---

## 🟡 Selects sem teto: o PostgREST trunca em 1000 EM SILÊNCIO — varrido em 2026-09-24, resta conferir o `max_rows` de produção

Achado em 2026-09-10, ao consertar `/colaboradores`. `supabase/config.toml:22` define
`max_rows = 1000` e o PostgREST **corta a resposta sem erro nenhum** — a tela recebe
1.000 linhas achando que recebeu todas. ⚠️ Esse é o valor do ambiente **local**; o de
produção fica nas API settings do dashboard e precisa ser conferido lá.

`/colaboradores` saiu da lista (passou a buscar sob demanda, paginado).

🔵 **Varredura completa em 2026-09-24:** todo `.from().select()` e todo `.rpc()` de conjunto do `src/`, cruzados com o tamanho real das tabelas. Os três pontos que restavam fecharam no mesmo dia (tabela abaixo). **O que ficou de fora, por ser pequeno por construção:** recortes por prova, unidade ou sala (máx. medido 531 por prova, 110 por unidade), catálogos (provas, editais, funções, bancos, `sala_prova` com 57) e RPCs que devolvem agregados. ⚠️ **Isso é uma foto:** recorte "pequeno" hoje pode não ser amanhã — a maior prova tem 531 alocações, e a próxima grande passa de 1000. ⚠️ **O `max_rows` de PRODUÇÃO segue não conferido** (fica nas API settings do dashboard do Supabase); tudo aqui supõe o padrão, 1000.

Estado por ponto:

| Onde | Tabela | Por que dói |
|---|---|---|
| ✅ ~~`useFuncoesAssociadas.tsx`~~ | — | **FECHADO em 2026-09-10** pela RPC `funcoes_em_uso`: 42,8 kB em 3 requisições viraram 680 bytes em uma, e o teto de 1000 deixou de alcançar a tela |
| ✅ ~~`OcorrenciasProva.tsx`~~ (picker de substituto) | — | **FECHADO em 2026-09-12** pela RPC `buscar_colaboradores_para_alocacao` |
| ✅ ~~`Dashboard.tsx`~~ (2 cards) | — | **FECHADO em 2026-09-24** pela RPC `totais_do_dashboard` (migration `20260925005346`). Chegou a tempo por pouco: `colaboradores_prova` estava com **977** linhas (555 em 12/09) |
| ✅ ~~`useEspeciaisDaProva`~~ | — | **FECHADO em 2026-09-24**, achado na varredura do dia: a RPC `especiais_da_prova` não tem `LIMIT`; passou a ser lida em fatias. Tamanho em produção **não medido** (`candidatos` vazia no local) |
| ✅ ~~`useUsers.tsx`~~ (`/gerenciar-usuarios`) | — | **FECHADO em 2026-09-24**, achado na mesma varredura: 4 leituras sem teto, a pior `user_roles` (127, ~2 por conta). Cortada, um admin apareceria como `user` |
| ✅ ~~`GerenciarProva.tsx`~~ (as **3** exportações) | — | **FECHADO em 2026-09-10** por `src/lib/buscar-em-fatias.ts`. ⚠️ Junto saiu um erro de doc: as duas primeiras eram descritas como PDF e são **planilha** |
| ✅ ~~`useColaboradores.tsx` (picker)~~ | — | **FECHADO em 2026-09-12**: o hook de listagem inteira foi REMOVIDO (ficou órfão), e `GerenciarColaboradoresProva` passou a buscar no servidor |

> ✅ **Os dois pickers de `colaboradores` fecharam em 2026-09-12** pela RPC `buscar_colaboradores_para_alocacao` (migration `20260912180627`), que busca e cruza no banco com `LIMIT` — imune ao teto por construção. Saíram junto: o hook `useColaboradores()` inteiro (órfão) e a `colaboradoresAlocadosQuery` (3 requisições). Bateria: `docs/bateria-buscar-colaboradores-alocacao.sql`, 15 casos, rodada e falsificada nos dois pontos que importam (o `LIMIT` e o `SECURITY INVOKER`).
>
> 🔴 **E este item também carregou premissa errada — a segunda vez nesta mesma seção.** Ao abrir o tema eu escrevi que o truncamento do cruzamento *"fura uma regra que só a tela sustenta"*, porque a unique da tabela é `(prova_unidade_id, colaborador_id)` e não cobre duas unidades da mesma prova. **Falso:** o trigger `check_colaborador_prova_unique` recusa no banco, nomeando o motivo. O que o truncamento tirava era o **aviso preventivo** — degradação de UX, não furo de regra. O erro veio de ler o NOME do trigger na listagem do `\d` sem abrir o corpo, que é exatamente o que o [`CLAUDE.md`](../CLAUDE.md) §8 manda não fazer. **Não há item a abrir sobre essa regra.**

**Onde está o padrão a reusar:** `useCandidatos.tsx:137-188` (`.range()` + `count: "exact"`,
filtro no servidor) para LISTAGEM paginada, e **`src/lib/buscar-em-fatias.ts`** para EXPORT
(trazer tudo, em fatias) — este último nasceu em 10/09 generalizando o laço que vivia em
`buscarRelatorioCompleto`. ⚠️ Quem usar `buscarEmFatias` **precisa ordenar por coluna
única**, senão o laço repete e pula linhas em silêncio. A UI é feita à mão em `Candidatos.tsx:488-512` — `components/ui/pagination.tsx`
existe mas **nenhuma tela o importa**.

---

## Rate limit — as duas etapas que sobraram (3 e 5)

**Status:** ⏳ 3 de 5 etapas feitas. 🔵 Até 2026-11-04 este tema morava como um marcador dentro de
"Temas de infraestrutura — futuro distante", embora tenha roadmap próprio e uma etapa que é só
configuração de produção.
**Área:** Auth e Permissões · roadmap [`analises/roadmap-rate-limit-fluxos-de-acesso.yaml`](./analises/roadmap-rate-limit-fluxos-de-acesso.yaml)

- **Etapa 3 — `minimum_password_length` > 6.** É configuração do Auth no **dashboard de produção** (não
  versionada): custo de código zero, e é o passo mais barato do grupo P1.
- **Etapa 5 — contar os 429.**

O texto que estava em "futuro distante", preservado:

- ~~Rate Limiting~~ → **saiu daqui em 2026-08-13** (roadmap próprio em [`analises/roadmap-rate-limit-fluxos-de-acesso.yaml`](./analises/roadmap-rate-limit-fluxos-de-acesso.yaml); o porquê em [`analises/analise-rate-limit-login.md`](./analises/analise-rate-limit-login.md)). ✅ **Etapas 1 e 2 EXECUTADAS em 2026-09-12:** a RPC `registrar_tentativa` (atômica, falhando fechado, com retenção e IPv6 normalizado para /64) substituiu o teto que falhava aberto, e as **duas portas públicas que não tinham teto nenhum** passaram a ter — `public-create-colaborador` (3/60min) e `check-cpf-colaborador` (30/15min). ✅ **Etapa 4 (cooldown por ALVO na `reivindicar-acesso`) feita em 2026-09-28**, dentro de [`analises/roadmap-cpf-link-para-conta-existente.yaml`](./analises/roadmap-cpf-link-para-conta-existente.yaml). ⏭️ **Continuam abertas** as etapas 3 (`minimum_password_length` > 6, que é config de dashboard) e 5 (contar os 429). ⚠️ Os tetos são **ordem de grandeza, não número medido** — ninguém passou por esses fluxos ainda.

---

## Sanear as contas do Auth (3 dívidas abertas pelo backfill)

**Status:** pendente — aberto em 2026-07-14, ao vincular os colaboradores que já eram usuários
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

Ao escrever o backfill do `seed.pos.sql`, a varredura das 15 contas do `auth.users` revelou três problemas. **Nenhum bloqueia a etapa 2**, mas todos ficam piores quando a recuperação de senha por e-mail passar a valer.

**1. Um coordenador loga com `ab@ab.com`.** É um e-mail de teste, e o e-mail real dele já está no cadastro de colaborador (`joao.041491@smevr.com.br`). Duas consequências: ele **nunca consegue recuperar a própria senha** (o link iria para uma caixa que não é dele), e `ab@ab.com` é um domínio que **outra pessoa pode passar a possuir** — o que faz de uma conta de coordenador um alvo de tomada de conta. O conserto é trocar o e-mail da conta no Auth para o do cadastro, avisando-o (muda o login dele) — hoje isso é a EF **`corrigir-email-acesso`**, que renomeia a conta sem apagá-la.

> 🔵 **A CAUSA foi fechada em 2026-09-12; a linha torta continua lá.** A conta nasceu pelo diálogo "Acesso dos Coordenadores", que até então pedia **e-mail e senha à mão** e criava a conta — o campo de e-mail era livre e ninguém o conferia contra o cadastro. Esse caminho não existe mais (a concessão usa a conta que o colaborador já tem, e um trigger exige que as duas coincidam), então **não nascem novos casos**; este aqui é anterior e segue pendente de correção manual.

**2. O Caio tem duas contas admin+superadmin:** `caiohis@gmail.com` (a que o backfill vinculou ao cadastro de colaborador dele) e `caio.teixeira@smevr.com.br`. A segunda é a **operacional de verdade** — assinou 406 linhas (232 e-mails do log, 87 metas, 32 salas, 31 alocações, 10 alocações de coordenador, 6 unidades, 3+5 finalizações); a primeira assinou 26. Excluir uma delas **não é trivial**: 8 FKs `created_by` são `NO ACTION`, então o `DELETE` **falha** enquanto as linhas existirem — seria preciso primeiro reapontar a autoria para a conta sobrevivente, o que **reescreve o histórico**. Tentado e abandonado em 2026-07-14 por ser complexo demais para o ganho. Enquanto as duas viverem, decidir qual é a canônica.

**3. Duas contas do Auth não casam com colaborador nenhum:** uma pessoa que não existe na tabela `colaboradores`, e uma "Nathalia" cujo `full_name` (só o primeiro nome) é ambíguo entre duas colaboradoras homônimas. Ambas têm só o papel `user` e ficaram **sem vínculo**, corretamente — o backfill se recusa a adivinhar. Elas podem se reivindicar pelo fluxo normal da etapa 2; o item aqui é só **conferir com um humano** quem são.

---

# P2 — Risco ativo e caro

Furos de segurança que pedem desenho.

---

## 🔴 DESFAZER A FRAGILIDADE: o autosserviço de e-mail não prova identidade

**Status:** ⏳ aberto em 2026-09-19, **no mesmo passe que criou a fragilidade** — não é
achado posterior, é dívida assumida na hora.
**Área:** Auth e Permissões · [`analises/dividas-auth-colaborador.md`](./analises/dividas-auth-colaborador.md) §5

Desde 19/09, quem tem cadastro **sem e-mail** informa o próprio em `/auth` com **CPF +
e-mail e nada mais**. O CPF não é credencial — está em documento, em ficha de RH, e o
sistema já confirma publicamente se um CPF existe. Quem souber o CPF de um dos **243**
aponta o cadastro para a própria caixa e entra como aquela pessoa; a partir daí
`update_meu_colaborador` aceita `p_chave_pix` e `update_meus_dados_bancarios` reescreve
banco/agência/conta. **O desfecho do ataque é redirecionar pagamento.**

**O conserto é prova de POSSE, não um segundo campo.** Um segundo dado do cadastro
(nascimento, matrícula) é mais uma coisa que se *sabe*, viaja no mesmo documento do CPF, e
ainda vira oráculo para adivinhá-lo. O que resolve é um **OTP no telefone do cadastro**: o
código vai para um número **já gravado**, não para um que o reivindicante escolheu — é
exatamente a propriedade que sustenta o fluxo por e-mail hoje.

**Medido em 2026-09-19:** **240 dos 243** têm telefone. Os outros 3 continuariam pelo
coordenador. O que falta é a integração de SMS/WhatsApp, que o sistema não tem (hoje só
há SMTP).

⚠️ **Enquanto não for feito, o que segura é frágil e precisa continuar de pé:** as guardas
da RPC, a recusa colapsada, os dois tetos (por IP e o global) e — principalmente — a
**trilha `log_email_autoinformado` + o aviso aos admins**, que é a única detecção. Mexer
em qualquer um sem ler a §5 é abrir a porta de par em par.

### E um item menor que nasce junto

**Tela para o admin ler a trilha.** Hoje `log_email_autoinformado` só se lê por SQL. O
aviso por e-mail avisa **um** evento; ver o padrão (*"12 registros do mesmo lugar em uma
hora"*) exige a tabela. Enquanto não existir, a consulta é manual.

---

## Senha provisória do "Resetar senha" não obriga troca no 1º login (aberto em 2026-11-25)

O "Resetar senha" do superadmin (EF `resetar-senha-colaborador`) entrega uma senha provisória para ele repassar. **Nada obriga a pessoa a trocá-la**: enquanto não trocar, o superadmin conhece a senha dela — e a tela só *pede* que troque. Foi deixado de fora da primeira entrega de propósito, para não inflar o escopo.

**O caminho provável:** a EF grava uma marca em `app_metadata` (não `user_metadata`, que a própria pessoa edita), o `useAuth` a lê, e o `RequireAcesso` manda para a troca de senha (`AlterarSenhaCard`) até ela sair; a marca se apaga quando a senha muda. ⚠️ A marca tem de ser apagada no **servidor** (EF/trigger), não pelo cliente — senão é conveniência, não regra. Ver `estrutura/transversais/auth-e-permissoes.md`.

## Troca de e-mail de conta confirmada (estado C) — sem caminho no app

**Status:** pendente — aberto em 2026-07-16, ao fechar as Etapas 1 e 2 da edição de `colab_email`
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

As três etapas da edição de `colab_email` sensível à identidade **estão feitas** (trava de UI + a EF `corrigir-email-acesso`, que renomeia a conta pendente do estado B). **Sobra o estado C:** quem tem login **confirmado** não consegue trocar o próprio e-mail pelo app — e a coordenação também não, de propósito (dar essa alavanca à coordenação reabriria o sequestro). Hoje a única saída é o dashboard do Auth, na mão.

Faltam as duas pontas: **(1) o caminho principal** — `supabase.auth.updateUser({ email })` no `PerfilColaborador`, com a dupla confirmação nativa e o sync de volta para `colab_email` quando confirmar; **(2) a exceção administrativa** — o dono que perdeu a caixa antiga, que exigiria ação separada, restrita a `admin`, auditada. Detalhe e o porquê de cada uma ter ficado de fora em [`analises/dividas-auth-colaborador.md`](./analises/dividas-auth-colaborador.md) §1-bis.

**Resíduo relacionado (§1):** a trava de `colab_email` é **de UI, não de banco** — a RPC `update_meu_colaborador` ainda aceita `p_email` e a policy de UPDATE ainda alcança a coluna, então uma chamada direta ao PostgREST re-ancora a linha. Fechar isso pede trigger (que dispara mesmo para `service_role`, então precisaria de escape para a `corrigir-email-acesso`) ou tirar a coluna do alcance da policy.

---

# P3 — Maior alavancagem

Protege todo o resto.

---

## Rodar a suíte de testes automaticamente (CI e/ou pre-commit)

**Status:** 🟡 **workflow escrito e verificado localmente em 2026-11-04 — falta o primeiro run no GitHub.** Ele só roda quando alguém empurra, e empurrar `dev` é decisão do usuário. **O item fecha (e vai para `concluidos/`) quando o primeiro run sair verde no GitHub**; se sair vermelho, a diferença entre o runner e esta máquina é o achado. Aberto em 2026-07-25 e adiado no mesmo dia por decisão do usuário ("deixar o CI para o final"), até a reordenação de 04/11.
**Área:** Infraestrutura (ver [`estrutura/transversais/arquitetura-geral.md`](./estrutura/transversais/arquitetura-geral.md))

### O que foi feito (2026-11-04)

- **[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)** — a cada push (qualquer branch), PR ou disparo manual: `npm ci`, depois `tsc`, `npm test`, `build` e o portão de lint. Os quatro rodam mesmo que um falhe (um push mostra todos os vermelhos), mas não se a instalação falhou. Sem segredo e sem banco: a suíte mocka o Supabase, e o build sai sem as `VITE_*` (o bundle do CI não é publicado). Node 24, o desta máquina.
- **Portão de lint por baseline** — `npm run lint:baseline` (`scripts/lint-baseline.mjs`) falha só se erros **ou** avisos passarem de `scripts/lint-baseline.json` (51 e 51, por regra), e diz qual regra subiu. Com `-- --atualizar` regrava. **Falsificado nos dois sentidos** num checkout limpo: um `any` novo reprova (`no-explicit-any: 48 → 49`, saída 1); um problema a menos passa e manda regravar.
- **Medido num checkout limpo de `HEAD` com `npm ci` e `TZ=UTC`** (o runner é UTC; esta máquina é -03): 2176 testes verdes em 110 arquivos, `tsc` limpo, build ok. Nenhum teste depende do fuso.
- 🔴 **Achado: o baseline era 102, não 107.** Os 5 a mais eram JS gerado em `my_rules/.vitepress/cache/` (fora do git), que o `eslint .` varria aqui e o checkout limpo não tem. O cache passou a ser ignorado no `eslint.config.js` — sem isso, o número local e o do CI nunca bateriam.

**O que ficou de fora, de propósito:** `docs:conferir` (precisa do banco local), `test:ef` (Deno, e casos que enviam e-mail real), as baterias SQL e o pre-commit (não pedido; continua opcional).

### O texto de quando o item estava aberto

O projeto ganhou uma suíte de regressão em 2026-07-25 (Vitest + React Testing Library, `npm test`), mas **nada a executa sozinho**: não há `.github/workflows/`, não há hook de pre-commit. Os testes só rodam quando alguém digita o comando.

**Por que isso não é detalhe:** uma suíte que ninguém executa não previne regressão nenhuma. E este repositório já pagou por isso — o `tsc` ficou **vermelho por 11 dias** por causa de um import morto deixado na subetapa 2A (`useOnlineColaboradores` em `ColaboradoresList.tsx`), atravessando os temas do hub e de Editais sem ninguém notar. `npm run build` sozinho não pegava, porque o esbuild descarta import não usado antes de resolver o módulo. Verificação manual depende de lembrar.

**O trabalho:** um workflow rodando `npm test`, `npx tsc --noEmit -p tsconfig.app.json` e `npm run build` a cada push/PR. Opcionalmente um pre-commit (husky + lint-staged) para o feedback rápido. **Atenção ao escolher o gate do lint:** o repo tem **52 erros** de eslint pré-existentes (107 problemas, medido em 2026-11-03; eram 69 erros quando este item foi escrito), então `npm run lint` não pode ser bloqueante hoje sem um passe de saneamento antes — ou trave só os arquivos alterados.

---

## Completar a suíte de testes (Vitest) — onde paramos e o que falta

**Status:** parcial — a suíte existe e roda desde 2026-07-25; a cobertura está **incompleta por decisão**, não por esquecimento
**Área:** Infraestrutura / transversal (ver [`estrutura/transversais/testes.md`](./estrutura/transversais/testes.md) para infra, convenções e as **12 armadilhas** — eram 7 quando este item foi escrito)

Este item é o marco: quem retomar os testes começa por aqui. **Leia `testes.md` antes de escrever teste novo** — as armadilhas ali custaram tempo real (a sequência do mock consumida pela listagem; `.at(-1)` pegando o refetch e não a mutation; `act()` no que atualiza provider; fake timers com `shouldAdvanceTime`; o caminho do `pagehide`, que não passa pelo mock do Supabase; **timeout usado como resposta**, que passou isolado e falhou na suíte cheia; e o `min`/`max` do input barrando **antes** do Zod em formulário com submit).

### Onde paramos (2026-07-26)

> ⚠️ **Foto de 2026-07-26.** O total em 2026-11-03 é **2176 testes em 110 arquivos** (CLAUDE.md §5);
> as contagens por camada da tabela abaixo **não foram remedidas** — trate como ordem de grandeza.

**743 testes em 46 arquivos.** Guards centralizados no `RequireAcesso` desde 2026-07-26. Vitest 2 + React Testing Library + jsdom, `npm test`. Infra em `src/test/` (mock do Supabase, helpers de render).

Coberto:

| Camada | Estado |
|---|---|
| **Hooks de dados** | **20 de 20** (`use-mobile` e `use-toast` são utilitários shadcn, fora da conta) |
| **UI de diálogo** | **12 de 12** — todos com `.ui.test.tsx` |
| **Guards de página** | `pages/guards.test.tsx` — 235 testes: matriz **25 páginas × 7 papéis**, a janela do `rolesLoaded`, o `isLoggingOut` e a cadeia rota→hub→portal |
| Schemas Zod | 9 schemas em 8 arquivos (o `SalaProvaDialog` tem dois: criação e edição) |
| Auth | `useAuth.test.tsx` — hierarquia, `colaborador` paralelo, `rolesLoaded`, `signOut` |
| Registro de módulos | `lib/modulos.test.ts` — invariantes sobre `MODULOS` inteiro |
| Acessibilidade | `dialogos-acessibilidade.test.ts` — invariante estática sobre os 31 diálogos |
| A própria infra | `supabase-mock.test.ts` — o mock tem teste próprio; e `lib/edge-function-error.test.ts` |

> Os números acima vêm de **varredura**, não de memória: a lista de hooks já esteve errada duas vezes (dizia 8 quando eram 12).

### O que FALTA

**1. Comportamento de página — a maior lacuna.** A bateria de guards cobre **autorização**, não comportamento: nenhuma página tem teste de formulário, listagem ou ação. As candidatas de maior valor são as que concentram ação destrutiva ou dinheiro — `GerenciarColaboradoresProva` (alocação, base de pagamento) e `OcorrenciasProva`.

**2. Edge Functions — tema próprio, não continuação desta suíte.** São **9** mais `_shared/` (eram 8), rodam em Deno e estão fora do alcance do Vitest. 🔵 ~~Exige decisão de ferramenta antes de qualquer código~~ — **decidida em 2026-08-02**: Deno instalado e `npm run test:ef` (ver `testes.md`). O que falta é **cobertura**, não ferramenta. É onde vive a lógica mais sensível: anti-enumeração, rate limit, cooldown.

O que **existe** hoje é verificação manual da autorização de duas delas, em [`../docs/bateria-create-admin-autorizacao.md`](../docs/bateria-create-admin-autorizacao.md) (7 casos, 2026-07-25) — inclusive o script de forjar JWT local, que qualquer teste futuro de EF vai precisar, porque o dump traz hashes de produção e ninguém sabe as senhas.

**3. ✅ FEITO em 2026-09-18.** A matriz ganhou os dois papéis que faltavam: **`user` puro** (conta sem gestão e sem `colaborador` — 3 contas) e **`colaboradorUser`** (`user` + `colaborador` — 40 contas, o caso mais comum do sistema). São 25 casos por papel, e o `user` puro entrou não por cobertura e sim como **controle positivo**: ele é o único caso que reprova um predicado de destino escrito sem o `isColaborador &&`. Esta linha dizia "vale se o `user` ganhar significado além de vê o hub vazio" — ele ganhou: virou o discriminador de quem é mandado a `/perfil-colaborador`.

**4. O que deliberadamente NÃO se testa aqui.** Constraints de banco: a suíte roda contra um **mock**, sem Postgres — um teste ali afirmaria o mock. A verificação correta é bateria SQL contra o banco local, feita em [`../docs/bateria-db-constraints.sql`](../docs/bateria-db-constraints.sql) (22 casos).

### O que as camadas fechadas renderam — e por que a ordem importou

**Testar diálogo de autorização ou de dinheiro rendeu mais achado que cobertura.** Foi o padrão de todas as etapas, e é o critério para escolher a próxima coisa a cobrir. O saldo de 2026-07-26: o **403 que bloqueava o superadmin** na concessão de coordenador, **valor de pagamento negativo** sem barreira em camada nenhuma, exclusão de valor **sem confirmação**, a **mensagem de erro da EF descartada**, o **CPF sem dígito verificador**, o aviso do cadastro público **invisível para leitor de tela**, e o **recorte por unidade** das ocorrências.

**A bateria de guards virou a especificação do `RequireAcesso`** e é o que tornou a centralização segura: ficou verde do começo ao fim, inclusive depois de os guards saírem das páginas. Foi **falsificada antes de ser aceita** — quebrar o guard do `Editais` derrubou exatamente "recusa colaborador" e "recusa coordenador".

**Três coisas que só apareceram ao escrever, e que valem para quem continuar:**

- ~~**`useSalasProva` esconde regra de negócio numa mutation:** `número = andar × 100 + sequência`, calculada no cliente.~~ 🔵 **Resolvido em 2026-08-03:** a regra saiu para `lib/salas.ts` (`numerosDoLote`, pura), o teto de 99 por andar passou a **recusar antes de escrever**, e a coerência número↔andar virou CHECK no banco (`chk_sala_numero_casa_com_andar`). Continua valendo o que já era certo: a sequência vem do **maior número daquele andar**, e buraco de sala excluída não é reaproveitado.
- ~~**O teto de andar da sala só existe no cliente** — regra entre tabelas, deixada fora dos CHECKs de propósito.~~ 🔵 **Não é mais regra (2026-08-03):** `unid_andares` foi dropada e o teto por unidade acabou. Sala em qualquer andar é legítima; o que o banco garante é a coerência número↔andar (`chk_sala_numero_casa_com_andar`).
- **`cargo_editavel === false` trava o nome da função**, protegendo as duas funções de coordenação identificadas por UUID fixo.

**Efeito colateral na infra:** o mock ganhou `FunctionErrorLike` (erro de EF não é erro do PostgREST) e o `supabase-mock.test.ts` ganhou dois testes por isso.

### Dívida de contexto que a suíte carrega

- **Mudança de produção feita para viabilizar os testes:** os 9 schemas Zod passaram a ser `export`ados dos componentes (**8 arquivos**; só a palavra `export`). Custo aceito: os 8 entram nos avisos de `react-refresh/only-export-components` — que somavam **19 no repo** em 26/07, a maioria pré-existente (`components/ui/*`, hooks e páginas que exportam constantes).
- **Baseline de lint do repo: 102 problemas (51 erros, 51 avisos)**, registrado por regra em `scripts/lint-baseline.json` e conferido por `npm run lint:baseline` — medido em 2026-11-04 (era 93 = 69/24 em 26/07; o "107" de 03/11 contava 5 do cache do VitePress). Se subir, é coisa nova.
- **Enquanto o CI não rodar no GitHub** (só roda no push), fechar tema inclui rodar à mão o que o `CLAUDE.md` §5 lista.

### A automação ficou para o fim, por decisão

🔵 **Superado em 2026-11-04:** o workflow foi escrito (item acima). O texto abaixo é o de antes.

**O usuário decidiu em 2026-07-25 deixar o CI para o final.** Não é esquecimento — está registrado no item próprio abaixo ("Rodar a suíte de testes automaticamente"), que segue válido e continua sendo **o de maior alavancagem da lista**. A consequência de a decisão valer: **nada roda a suíte sozinho**, então cada tema fechado depende de alguém lembrar.

⚠️ **O custo dessa decisão cresceu.** Em 25/07 eram 376 testes; em 26/07, 743; em 2026-11-03, **2176**, e as três camadas fechadas (hooks, diálogos, guards) só protegem quem as executa. O argumento original — "escrever mais teste rende menos até o CI existir" — agora aponta com mais força para o CI do que para a próxima camada de cobertura.

---

# P4 — Correções pequenas

Defeitos reais e localizados, ou código e doc sobrando.

---

## O papel `colaborador` sobrevive à exclusão da linha de `colaboradores`

**Status:** aberto em 2026-09-18, ao mandar o colaborador sem gestão para `/perfil-colaborador`
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

`handle_new_user` **concede** o papel `colaborador` quando o e-mail da conta nova casa com um cadastro, mas **nada o revoga** quando aquela linha de `colaboradores` é apagada. A FK `colaboradores.user_id` é `ON DELETE SET NULL` — ela protege a conta, não o papel.

**Quem fica nesse estado cai num lugar que só existe para ele:** `/perfil-colaborador` renderiza o ramo "cadastro não localizado", porque `get_meu_colaborador` não acha nada. Medido em 2026-09-18: **1 conta em 53** (de teste, criada em 15/09, nunca logou).

⚠️ **Passou a importar em 18/09**, quando o redirecionamento deixou de ser teórico: antes ninguém era mandado para a página, agora todo colaborador sem gestão é. O sintoma agudo — o **beco sem saída**, sem botão "Sair", com `/auth` rebatendo quem está logado e só o timeout de 5 min como saída — **foi corrigido no mesmo passe**. O que sobra é a causa: o papel mente sobre o que a pessoa é.

**O conserto é de banco, não de tela** (§2 do `CLAUDE.md`): um trigger `AFTER DELETE` em `colaboradores` que remova o papel `colaborador` do `user_id` daquela linha. Duas coisas a medir antes: se alguém **reaproveita** o papel entre cadastros (o `SET NULL` sugere que a conta pode ser recadastrada) e se há linha com o papel sem conta. **Controle positivo obrigatório:** apagar um cadastro revoga o papel **e** a exclusão de um colaborador sem conta continua passando.

---

## Busca sensível a acento — falta CANDIDATOS

🔵 **`/colaboradores` foi resolvido em 2026-09-10** (migration `20260911011204`: coluna
computada `colab_nome_busca` + `src/lib/texto.ts`). O item continua aberto para a outra
tela.

`useCandidatos.tsx:171` faz `.or(nome.ilike...)` direto na coluna, então **"jose" não acha
"José"** na listagem de inscritos. Com 1.527 nomes acentuados medidos na importação, isso
encontra usuário.

**O caminho já está trilhado e é copiável:** função `IMMUTABLE` sobre a linha com o mesmo
`translate()` (nada de extensão `unaccent`, que não é imutável de verdade), `GRANT` a
`authenticated` **e `service_role`** — esquecer o segundo dá `42501` em toda leitura pela
chave de serviço —, e o cliente normalizando o termo com o `removerAcentos` que já existe.
⚠️ O teste de paridade entre os dois mapas (`src/lib/texto.test.ts`) precisa passar a
cobrir a migration nova também: sem ele, divergir os mapas quebra a busca em silêncio.

⚠️ `candidatos` tem MILHARES de linhas, ao contrário de `colaboradores` — então aqui a
conta do índice muda, e o desenho pode ter de ser coluna **gerada** (indexável) em vez de
computada. Meça antes: coluna gerada em `candidatos` mexe no dump.

---

## O PDF de ocorrências só timbra a página 1

**Status:** achado em 2026-08-01, ao extrair `src/lib/pdf-timbre.ts`. Preservado de propósito, não corrigido.
**Área:** Aplicação de Provas

`OcorrenciasProva.exportPdf` chama o timbre **uma vez**, antes da tabela. O `didDrawPage` dela só escreve o rodapé. Uma prova com ocorrências que transbordem para a segunda página gera um documento em que **da página 2 em diante não há logo, nem fundação, nem nome do edital** — folhas soltas sem identificação.

🔴 **É SÓ ESTE dos três documentos, e confundi-los já custou uma investigação (02/08).** O sistema tem três páginas que geram PDF, e as outras duas timbram tudo:

| Página | Timbra todas? | Como |
|---|---|---|
| `CandidatosImportar` | ✅ | `didDrawPage: timbrar` + `Set` de páginas já timbradas |
| `DocumentosImpressao` | ✅ | pagina à mão e chama `addHeader()` a cada folha (`:207`) |
| **`OcorrenciasProva`** | ❌ | `desenharTimbre` **uma vez**, antes da tabela |

⚠️ **Antes de reabrir isto suspeitando do `pdf-timbre.ts`: a extração NÃO causou o problema.** Verificado em 02/08 por três vias — leitura (`OcorrenciasProva.tsx:360` e `:394`), execução (reproduzida a sequência com 120 ocorrências: 6 páginas, timbre só na 1) e histórico (`git show 969c659` mostra que o código anterior também chamava `addHeader()` uma única vez). O comportamento é **anterior** ao `pdf-timbre.ts`.

Não foi corrigido junto com a extração porque **corrigir muda o documento emitido**, e a extração tinha como regra não mudar nenhum. As duas coisas não deviam viajar no mesmo passe: se o leiaute mudasse junto, ninguém saberia depois se foi a extração que estragou.

📌 **Reafirmado em 2026-08-02 pelo usuário: fica como está** — a medição de quantas ocorrências cabem numa folha continua não feita, e é ela que diz se o item vale.

- **A correção é pequena:** trocar a chamada única por `didDrawPage: timbrar`, com o mesmo `Set` de páginas já timbradas que `CandidatosImportar` usa — o padrão está lá, pronto para copiar.
- ⚠️ **Junto vem o `margin.top`:** sem ele, a tabela que continua na página 2 começa no topo e passa **por baixo** do timbre novo. É o mesmo par que `CandidatosImportar` resolve com `topoDoCorpo`.
- **Medir antes:** não sei quantas ocorrências cabem numa página nem se alguma prova real já passou disso. Se nunca passou, o item vale menos do que parece — mas o custo de não saber é um documento oficial saindo errado sem ninguém ver.

⚠️ O comportamento está anotado em [`estrutura/modulos/aplicacao-provas/ocorrencias.md`](./estrutura/modulos/aplicacao-provas/ocorrencias.md) e em `documentos-e-relatorios.md`. **Se este item for fechado, os dois avisos saem no mesmo passe** — aviso envelhecido é pior que aviso nenhum.

---

## Candidatos — o que o módulo deixou em aberto

**Status:** o módulo está pronto e verificado (2026-07-27). Estes são os fios soltos que ele **não** resolveu, e nenhum bloqueia nada hoje.
**Área:** módulo Candidatos — ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md)

🔵 Os itens 1 (vínculo candidato↔prova/sala — virou o módulo Alocação de Candidatos em 2026-08-04) e 2
(`editais.n_candidatos` × contagem real, 2026-08-02) fecharam e estão em
[`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md).
A numeração foi mantida.

1. **Decisão pendente que o item 1 deixou:**
   ⚠️ **O que o item destravava segue como decisão separada, ainda não tomada:** com o vínculo existindo, uma prova que aplique só um recorte do edital passou a ser *exprimível* — mas a fonte única do nº de inscritos **não foi reaberta**, e a distribuição assume a mesma premissa de 02/08 (todo inscrito do edital entra). Reabrir é pelo vínculo, **nunca** por campo digitado de volta no `ProvaDialog`.

3. **`CadastroLote.tsx` continua lendo planilha do jeito errado** — modo objeto (perde coluna de cabeçalho repetido) e sem `raw: false` (come zero à esquerda). Não deu problema porque o template de colaboradores não tem cabeçalho repetido, mas é a mesma classe de defeito que `candidatos-import.ts` resolve. Migrar aquele fluxo para a leitura por índice é dívida conhecida.

---

## Defaults do `QueryClient`: `staleTime: 0` e refetch a cada foco de janela

`src/App.tsx:41` é `new QueryClient()` **sem `defaultOptions`**, então toda query do app
é stale na hora e **refaz a cada alt-tab de volta**. Com ~180 ms de RTT para `us-west-2`,
pesa em toda tela.

🔴 **Não é mudança de uma linha.** `GerenciarSalasDistribuidas.tsx:58-62` tem estado local
escrito *assumindo* esse comportamento, e `GerenciarSalasDistribuidas.ui.test.tsx:185`
cobre isso. Mexer no global exige varrer quem depende dele. Definem `staleTime` por conta
próprio: `useBancos.tsx:22` (1h), `useColaboradores.tsx` e `ProvaTotaisDialog.tsx` — 🔵 conferido em
2026-11-04; esta linha dizia "único hook".

---

## 📤 Exportação DAF — o que a avaliação de 2026-11-27 deixou para depois

A avaliação do botão "Exportação DAF" (`GerenciarProva`, entrada do módulo Financeiro) teve 5
itens. **Feitos em 27/11:** o valor passou a ser assumido como AO VIVO, com a prova finalizada
congelando-o (`PF001`, migration `20261128000031`), e a montagem foi extraída para
`src/lib/exportacao-daf.ts` com teste de contrato. **Decisão do usuário: não exportar
`tipo_chave_pix`.** Ficaram, por decisão dele ("depois cuidamos dos demais"):

1. **Autorização — pergunta, não defeito.** O módulo Financeiro nasceu sem `admin` (decisão
   D1), mas o DAF — CPF, chave PIX e valor de cada colaborador — é exportado por `admin`
   (`/gerenciar-prova` é `papeis={["admin"]}`). Pode ser intencional (o arquivo vai para outro
   setor); falta confirmar.
2. **Fidelidade de campos do arquivo** (medido no banco local em 27/11):
   - **CEP** é coluna numérica e perde o zero à esquerda — 24 de 788;
   - **Data de nascimento** sai `AAAA-MM-DD`, não `DD/MM/AAAA`;
   - **"Valor Líquido"** é o valor bruto da função, sem desconto — o rótulo está certo para o uso?
     ⚠️ É rótulo de CONTRATO com o Financeiro: mudá-lo exige mudar `COLUNAS_SISTEMA` junto (o
     teste de contrato derruba se não);
   - **nome do arquivo** sai `colaboradores_*.xls`, não "DAF";
   - **falha de exportação** mostra genérico e descarta a mensagem do banco (§2 do CLAUDE.md).
3. ~~🔴 `encerrar_ocorrencias_unidade` confia no `p_user_id` do cliente~~ — ✅ **FECHADO em
   2026-11-27** (migration `20261128002649`): `auth.uid()`, só superadmin ou coordenador da
   unidade, e senha recente conferida pelo banco. Ver `estrutura/modulos/aplicacao-provas/ocorrencias.md`.
   ⚠️ **O irmão segue aberto:** `get_coordenador_prova_unidade_ids(p_user_id)` também recebe a
   identidade do cliente — é só leitura (devolve ids de unidade de outra pessoa), não escreve nada.

## 💸 Módulo Financeiro — perdas silenciosas na leitura da planilha

**Status:** ⏳ **parcial.** Vem da avaliação de 2026-11-03; cada ponto abaixo foi conferido no
código. Já corrigidos no mesmo dia (ver `00-modulo.md`, "Pontos frágeis"): a célula numérica com
centavos lida 10× (junto com a regra de reais inteiros), o **valor ilegível que virava R$ 0,00** e
as **linhas ignoradas sem dizer quais** e a **chave PIX trocada calada pelo CPF** — hoje toda
linha recusada aparece com nome e motivo. 🔵 Os itens 2, 3 e 4 desta lista eram esses; os números
abaixo foram mantidos. **Sobra só o 1** (prioridade baixa, medido). O 5 também foi corrigido.
**Área:** módulo Financeiro — ver [`estrutura/modulos/financeiro/00-modulo.md`](./estrutura/modulos/financeiro/00-modulo.md)

1. **CPF/chave PIX guardados como NÚMERO perdem o zero à esquerda** (`raw: true` em `lerPlanilha`).
   A chave de 10 dígitos pode virar telefone `+555261923727` sem aviso. 🔴 **Não troque para
   `raw: false` sozinho:** o SheetJS formata em en-US (`"1,500.50"`) e quebraria o valor. O caminho
   provável é tratar a célula numérica de CPF/chave no `celulaParaTexto` (ou por coluna), com teste
   em `.xlsx` real com célula de número.
   🔵 **Medido em 2026-11-03 numa planilha real** (`colaboradores_Edital_003_2026_-_SMA.xls`, 423
   linhas): CPF e `Chave PIX` vêm como **texto** em todas as linhas — 134 CPFs começam com zero e
   chegam intactos. O defeito **não ocorre** nesse formato de exportação; só reabre se aparecer
   planilha com essas colunas tipadas como número. Prioridade baixa.
2. ~~Valor ilegível vira R$ 0,00 calado~~ — **corrigido em 2026-11-03** (linha recusada, com motivo).
3. ~~Linhas ignoradas sem dizer quais~~ — **corrigido em 2026-11-03** (`AvisoRecusadas`).
4. ~~Chave PIX preenchida e inválida é trocada calada pelo CPF~~ — **corrigido em 2026-11-03**:
   a linha é recusada, com a chave no motivo (decisão do usuário: recusar, não recuperar sozinho).
   🔵 **Medido em 2026-11-03 na mesma planilha real:** **5 de 423** chaves preenchidas caem nessa
   troca calada (mais 2 vazias, que vão para o CPF por desenho). Formato, sem os valores: 2 com
   **9 dígitos** (celular sem DDD; a coluna Telefone = DDD + a chave), 1 com **12 dígitos começando
   em 0** (`0` + o telefone da linha), 1 com 12 dígitos cujos 8 finais batem com o telefone, e 1
   com 14 dígitos. As 3 primeiras são recuperáveis **exatamente** pela coluna Telefone da própria
   linha; as outras 2, não.
5. ~~CPF do favorecido sem validação de DV/tamanho, e validador duplicado~~ — **corrigido em
   2026-11-03**: a linha é recusada com o motivo (2 de 423 na planilha real), e o módulo usa o
   `src/lib/cpf.ts`.

---

## Financeiro: três acertos pequenos de arrumação

**Status:** ⏳ **não iniciado.** Era o "PRÓXIMO" definido em 2026-11-03; na reordenação por prioridade de
2026-11-04 ficou atrás dos riscos ativos, por ser arrumação. Vem de uma avaliação do módulo trazida pelo usuário em 03/11;
conferido na hora, e nenhum dos três foi tratado nos temas daquele dia. Nada aqui é defeito em
produção — é doc envelhecida e código sobrando.
**Área:** módulo Financeiro — ver [`estrutura/modulos/financeiro/00-modulo.md`](./estrutura/modulos/financeiro/00-modulo.md)

1. **Roadmap concluído fora de `concluidos/`.** `analises/roadmap-modulo-financeiro.yaml` está
   marcado ✅ CONCLUÍDO (2026-09-24) mas segue na raiz de `analises/` — contra a regra de
   `analises/README.md`. ⚠️ **Mover exige atualizar quem aponta para ele:** os links em
   `00-modulo.md` e no item de persistência deste backlog, e a menção em
   `concluidos/backlog-itens-concluidos.md`. Os cabeçalhos de `src/lib/financeiro-*.ts`,
   `guards.test.tsx` e `useUsers.test.tsx` citam o NOME (não um link) — decidir se ganham o
   caminho novo ou ficam como estão. `npm run docs:conferir` pega link quebrado nas docs vivas.
   🔵 **Medido em 2026-11-04: não é só ele.** Também estão concluídos e na raiz de `analises/`:
   `roadmap-n-inscricao-12-caracteres.yaml`, `roadmap-cpf-link-para-conta-existente.yaml`,
   `roadmap-ilike-curinga-email.yaml` e `roadmap-lista-de-candidatos-e-exclusao.yaml`. Vale mover
   todos no mesmo passe, com a mesma caça aos apontadores.
2. **Spinner de `authLoading` redundante em `Financeiro.tsx`.** A página checa `if (authLoading)`,
   mas o `RequireAcesso` da rota já segura a renderização enquanto `loading || !rolesLoaded`. Não é
   defeito; é código que sobra. Ao tirar, conferir que `guards.test.tsx` e `Financeiro.ui.test.tsx`
   seguem verdes.
3. **A justificativa dos 2 avisos de `complexity` envelheceu — por causa dos temas de 03/11.**
   (a) O `CLAUDE.md` §5 **não a tem mais**: estava no parágrafo do histórico do lint, enxugado
   no /doctor de 03/11. Hoje o porquê só mora no `00-modulo.md`. (b) Lá, o aviso é atribuído a
   `converterPlanilhaParaPagamentoPix`, mas desde 03/11 ele cai em **`lerPagamentosDaPlanilha`**
   (o `converter…` virou invólucro de uma linha), e a frase ainda fala em "baseline de 111 para
   113", números de setembro. O custo aceito continua valendo (port fiel da origem); é o TEXTO que
   precisa de acerto. Medir com `npx eslint src/lib/financeiro-*.ts` antes de escrever.

---

## ⏳ Pendente da v3.7.0: o passo do convite não rodou

❌ *Aqui havia, por algumas horas de 2026-09-24, um item "`create-coordenador` ainda publicada em produção". **Premissa falsa**, a quinta deste backlog: conferido pela lista oficial de funções do projeto, ela **já não existia** lá (404). O item saiu no mesmo dia, sem nada a executar — ver `integracoes-externas.md`.*

⚠️ O passo do convite no teste da `conceder-papel-sistema` não rodou (`EF_TESTE_ENVIA_EMAIL=1`, envia e-mail real para domínio `.invalid`). O caminho que ele cobre (conta nascendo por invite, vínculo, trilha) é o que a `reivindicar-acesso` já exercita em produção; a parte nova é o INSERT do papel depois.

---

# P5 — Produto e ferramental

Funcionalidade nova. A fatia 12 vem primeiro porque fecha o objetivo do módulo Editais e destrava os dois itens seguintes.

---

## 📄 Editais v3, fatia 12 — exportação (PDF / Markdown / JSON)

**Status:** 🟡 **em andamento desde 2026-11-16** — etapas 1 a 4 de 5 concluídas (documento montado, anexos e quadros numerados, Markdown, portão com botão "Exportar"), **commitadas e empurradas para `origin/dev`** (🔵 até a noite de 16/11 esta linha dizia "não commitadas"); falta a 5 (comparar com o Edital 002). Escopo decidido: **só Markdown**, JSON adiado. O roadmap é [`analises/roadmap-editais-exportacao.yaml`](./analises/roadmap-editais-exportacao.yaml). 🔵 Até 16/11 esta linha dizia *"não iniciada… ainda em esboço"*.
**Área:** módulo Editais — ver [`estrutura/modulos/editais/00-modulo.md`](./estrutura/modulos/editais/00-modulo.md)

### 📍 ONDE PARAMOS — 2026-11-16 (pausado para outra tarefa)

**Commitado e empurrado para `origin/dev` em 2026-11-16**, em dois commits: `feat(editais)` da
exportação (etapas 1 a 4, conferências de painel, mensagem de cotas) e `fix(editais)` dos campos.
Verificado no fim da sessão: `npm test` 2320/121 · `tsc` limpo · `lint:baseline` 51/51 · `build`
ok · `docs:conferir` sem divergência. ⚠️ **Nada disto está em `main` nem em produção.** ⚠️ Os arquivos não rastreados em `my_rules/`
(`Captura de tela…png`, `Supabase Snippet…csv`, `analises/checkpoint-monitoramento.md`,
`otimizing/`, `seguranca`) **não são desta fatia** — não entram no commit dela.

**Feito nesta sessão** (detalhe no roadmap e na doc do módulo):
- etapas 1 a 4 do roadmap: documento montado (`edital-documento.ts`), anexos e quadros numerados
  (`edital-anexos.ts`, marcadores `{{anexo:}}`/`{{quadro:}}`), Markdown (`edital-markdown.ts`) e o
  portão com o botão **Exportar** (`edital-exportacao.ts`, `ExportarEdital.tsx`);
- o portão vê linter + documento + as **dez conferências de painel** (`edital-conferencias.ts`) e
  distingue consulta que falhou de vazia (`useConsultasComErro`);
- de carona: a mensagem de cotas parou de escrever "10%/20%" fixos; **sete campos** que mandavam
  preencher no capítulo errado ou não tinham input foram consertados (Preâmbulo; editor novo
  `VistaDaFolha` em Recursos da prova objetiva; "Leis que fundamentam a reserva" no cartão de PCD);
  botão **"Campos do edital"** no alto de cada capítulo.

🔵 **Atualizado no fim de 16/11:** depois do push, a leitura geral do módulo gerou os roadmaps
de **consertos** e **melhorias** (seção própria abaixo), e a ordem de retomada passou a ser a
do quadro "📍 Onde o módulo está" no `00-modulo.md`: **E1** (navegador) → **E2 + M11** (o
cabeçalho do preâmbulo, que não sai na exportação, e o número como `NÚMERO/ANO`; 🟢 o sufixo
`-SMA` foi decidido em 19/11 — campo próprio, `004/2026-SMA`) → **E3** (a etapa 5 abaixo). A lista seguinte continua valendo como
o detalhe da E1 e da E3.

**Para retomar, nesta ordem:**
0. 🟢 **E2 + M11 feitas em 2026-11-20** — cabeçalho no documento/prévia/Markdown/portão, número
   composto `002/2026-SMA` (colunas novas `secretaria_publicadora` + `secretaria_sigla`). Falta
   **medir em produção** se algum edital guarda a forma antiga no número. Próximo: a E3 (+E9).
1. ~~**Conferir no NAVEGADOR**~~ 🟢 **feito em 2026-11-20 (E1)** — tudo abaixo passou; abriu a E9 (peso `2.5`). Detalhe na E1 do roadmap de consertos:
   - prévia: "Quadro I/II…" sobre cada tabela, anexos depois do último capítulo;
   - Exportar: uma caixa por pendência (as de painel com o título do capítulo), botão só libera
     com todas; artigo não salvo → recusa; abrir o `.md` (alíneas como `a\)`, `7.1.` sem barra);
   - "Campos do edital"; o cartão da vista em Recursos da prova objetiva; as leis em Vagas PCD.
2. **Etapa 5** do roadmap: montar o Edital 002 inteiro no sistema e comparar o Markdown exportado
   com o publicado — o controle positivo final do módulo.

 As 11 primeiras montam o documento no banco; esta é a que o tira de lá. Sem ela, o edital continua sendo redigido no Word e o sistema é só um formulário — o que o `00-Plano-v3.md` chama de "gerar o edital publicável" não acontece.

⚠️ **E é onde duas dívidas registradas deixam de ser hipótese:**

1. **O e-mail duplicado** (`regras_vista_prova.email_solicitacao` × `edital_canais_atendimento`) passa a sair impresso **no mesmo documento**, em capítulos diferentes. Hoje a divergência é um aviso de tela; na exportação vira erro visível no PDF. Ver [`estrutura/transversais/invariantes.md`](./estrutura/transversais/invariantes.md). 🔵 **Desde 16/11 ela chega ao portão da exportação** como pendência (aviso) do capítulo da inscrição, junto com as outras nove conferências de painel. A duplicação em si continua: duas colunas guardando o mesmo endereço. 🟢 **E assim fica — decisão do usuário em 2026-11-19** (E7 do roadmap de consertos): manter, com o portão como guarda permanente.
2. **Os dois quadros gerados não reproduzem a forma publicada** — o Quadro II de provas e os Quadros III/IV de títulos saem com uma linha por cargo, onde o Edital 002 agrupa. Foi **decisão do usuário** (não agrupar), e a exportação é onde ela aparece.

⚠️ **O que já está pronto e ela consome:** a numeração calculada de capítulo e artigo, a resolução de `{{cap:}}` e `{{item:}}`, o `segmentarNegrito`, e as cinco fontes de quadro renderizando de verdade.

🔵 **Corrigido em 2026-11-16, medido no código.** Esta linha terminava com *"a prévia em `EditalStudio` já monta o documento na tela — a exportação é levá-lo para fora, não remontá-lo"*. **Não é o documento inteiro:** o conteúdo programático e as áreas de abrangência não aparecem na prévia (só existem como editores), e os quadros são componentes React que buscam o próprio dado — nada disso é alcançável por um exportador. Ver `medido_no_codigo_em_2026_11_16` no roadmap.

🔴 **A armadilha que o roadmap da fatia 7 deixou avisada:** o Anexo de abrangência tem **843 logradouros** num edital, 84% do teto de 1.000 do PostgREST. A leitura já passa por `buscar-em-fatias`; **a exportação não pode contorná-la** — um select solto devolveria 1.000 e o anexo sairia com uma rua faltando, sem erro nenhum.


---

## 📋 Editais — DOIS roadmaps novos: consertos e melhorias (2026-11-16)

**Status:** ⏳ criados a pedido do usuário, por leitura geral do estado do módulo; nada executado.
**Área:** módulo Editais · [`analises/roadmap-editais-consertos.yaml`](./analises/roadmap-editais-consertos.yaml) · [`analises/roadmap-editais-melhorias.yaml`](./analises/roadmap-editais-melhorias.yaml)

- **Consertos (E1–E9):** ~~conferir a fatia 12 no navegador~~ (🟢 E1 feita em 20/11) · 🔴 **o cabeçalho do preâmbulo NÃO sai
  na exportação** (achado novo de 16/11, conferido por grep — a rodada 2 prometeu "vem da fatia 12"
  e ela veio sem ele) · etapa 5 (Edital 002 × publicado) · a RPC do `importarAbrangencia` (item
  abaixo) · a prévia lendo falha como vazia · rodar as 12 baterias SQL · a decisão do e-mail da
  vista · as dívidas de transição (inventário, não execução).
- **Melhorias (M1–M10):** as três fontes de quadro que faltam (`documentos_investidura`,
  `criterios_desempate`, taxas — absorvem 3 das 5 pendências do EDITAL PADRÃO abaixo) · as 4
  colunas de `provas_objetivas_config` na matriz · casa para os valores sem coluna · o modelo
  citando nº de anexo/quadro · e as adiadas com gatilho (JSON, agrupamento, diff, PDF).
  🟢 **M11 FEITA em 2026-11-20, com a E2** (ver o roadmap). Era:
  🔵 **M11 (pedido de 16/11):** `{{campo:numero_edital}}` passa a imprimir **NÚMERO/ANO**. Hoje
  sai só o número; a dica do input manda digitar `004/2026-SMA`, e as duas convenções convivem.
  🟢 **Decisões de 2026-11-19:** o sufixo da secretaria vira **campo próprio** (número em três
  partes, `004/2026-SMA`, como nos publicados); **E7 fechada** — manter as duas colunas do e-mail
  da vista; **M1–M4 e M6 congeladas** ("não toque agora") — mudam o texto do modelo.

---

## ⚠️ `importarAbrangencia` apaga e reinsere SEM transação (achado em 2026-11-16, não executado)

**Área:** módulo Editais, territorialidade — `src/hooks/useTerritorialidade.tsx`

Importar as ruas de uma unidade faz **dois passos PostgREST**: `DELETE` de todas as linhas da
unidade em `territorialidade_abrangencia`, depois `INSERT` das novas. Se o segundo falhar (rede,
uma linha recusada por constraint), o primeiro já valeu: **a unidade fica sem nenhuma rua**, o
toast mostra o erro do insert e nada diz que as antigas sumiram. É o padrão "vários passos sem
transação" do CLAUDE.md §8, e o Anexo de abrangência é exatamente o que a exportação publica.

**Conserto pelo §2:** uma RPC que faz as duas coisas numa transação (e devolve a contagem). ⚠️
Lembrar do teto de 1.000 do PostgREST na leitura (já em `buscar-em-fatias`) — na escrita, um
único insert com 843 linhas cabe, mas medir o payload antes de desenhar.

🔵 **Detalhado em 2026-11-16 como etapa E4 de
[`analises/roadmap-editais-consertos.yaml`](./analises/roadmap-editais-consertos.yaml)** — este
item continua sendo o registro; o roadmap é o plano.

---

## 📄 EDITAL PADRÃO — as cinco pendências que sobraram do tema

**Status:** ⏳ aberto em 2026-09-19, quando o **texto padrão ficou completo** (19 capítulos, 377
artigos, versão `1.0` — o tema em si saiu daqui para
[`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md)).
**Área:** módulo Editais — ver [`estrutura/modulos/editais/00-modulo.md`](./estrutura/modulos/editais/00-modulo.md)

🔴 **As três primeiras são a MESMA pendência:** existe tabela com dono estruturado que o documento
ainda não sabe renderizar, e por isso o texto pede o conteúdo por `{{redigir:}}`. Cada uma é um
valor novo no domínio de `chk_edital_item_quadro_fonte` **mais** um renderizador — fonte nova exige
fatia nova, e sem o renderizador o artigo cai no ramo "fonte desconhecida".

| # | tabela sem `quadro_fonte` | onde o texto sente |
|---|---|---|
| 1 | `documentos_investidura` | cap. 15 — a lista que produziu o **COREN exigido de ACS** |
| 2 | `criterios_desempate` | cap. 14 — a ordem por disciplina, que difere nos três editais |
| 3 | taxas por cargo | cap. 6 — a lista de alíneas de valor de inscrição |

4. **A matriz (`quadro_fonte: 'disciplinas'`) não rende duração, tempo mínimo de permanência,
   tempo para levar o caderno nem nota de corte** — as quatro colunas de `provas_objetivas_config`,
   que é **por cargo**. Enquanto não render, o capítulo 12 descreve os três tempos com
   `{{redigir:}}` nomeando a tabela. ⚠️ **Não vire `{{campo:}}`:** qualificador por cargo foi
   medido e rejeitado na rodada 0.
5. **Valores sem coluna em lugar nenhum**, hoje literais ou instrução: a fonte da prova ampliada,
   os 60 minutos de tempo adicional, as 72 horas do pedido tardio, a antecedência de uma hora, o
   **e-mail da impugnação**, o órgão oficial de publicação e o endereço do **órgão demandante**
   (que não é o da entidade executora — confundi-los manda o candidato ao lugar errado).

🔵 **Numerar ANEXO e QUADRO saiu daqui em 2026-11-16** — feito na fatia 12, etapa 2. Ver [`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md).

🔵 **As cinco pendências ganharam forma de etapa em 2026-11-16**, no
[`analises/roadmap-editais-melhorias.yaml`](./analises/roadmap-editais-melhorias.yaml) (M1–M5).
Esta seção continua sendo a fonte do porquê; o roadmap é a ordem e a receita.

---

## ⏭️ NA FILA (era a próxima até 2026-09-18) — dois tipos de distribuição automática: máxima e homogênea

**Status:** ⏳ **não iniciado, e o desenho NÃO está fechado.** O usuário anunciou o tema em 2026-08-05 e disse que **dará mais detalhes na hora de implementar**. Esta entrada existe só para o tema não se perder — não é especificação.
**Área:** módulo Alocação de Candidatos — ver [`estrutura/modulos/alocacao-candidatos/00-modulo.md`](./estrutura/modulos/alocacao-candidatos/00-modulo.md)

Hoje existe **uma** forma de o plano encher as salas: sequencial, do ponteiro em diante, cada bloco começando em sala nova e enchendo cada sala até a capacidade antes de passar para a seguinte. O tema acrescenta a escolha entre **duas** políticas:

| | O que se espera dela (a confirmar) |
|---|---|
| **Alocação máxima** | o comportamento de hoje: encher cada sala até o teto antes de abrir a próxima |
| **Alocação homogênea** | espalhar o bloco pelas salas disponíveis, equilibrando a ocupação em vez de lotar as primeiras |

🔴 **Não implemente a partir desta tabela.** Ela é a leitura do que os nomes sugerem, não a regra do usuário. Perguntar antes, no mínimo: a política é escolhida **por prova, por plano ou por bloco**? A homogênea equilibra dentro da **unidade** ou da **prova inteira**? Ela ainda respeita "cada bloco abre sala nova"? E o que acontece com a sala de fronteira?

### O que já está pronto e vai ser tocado

- **`aplicar_plano_de_alocacao`** (migration `20260805205719`) — o laço por entrada do plano é onde a política entra. Hoje o miolo é `pos ∈ (ini, fim]` sobre faixas cumulativas de vagas; homogênea provavelmente não é uma faixa cumulativa.
- 🔴 **`simularEmpacotamento`** (`src/lib/alocacao-dnd.ts`) — a tela **espelha** o laço do banco para dizer o que cabe. **Uma política nova no banco sem a mesma política na simulação faz a tela voltar a oferecer vaga que o banco recusa** — foi exatamente o defeito de 05/08 (ofereceu 152 onde havia 120). As duas mudam no mesmo passe, ou nenhuma muda. Ver §8 do `CLAUDE.md`.
- **`docs/bateria-alocacao-candidatos.sql`** — os casos 1, 1b, 2 e 3 afirmam a distribuição sala a sala **pelo nome de quem ficou onde**. Com política nova, eles precisam dizer QUAL política estão exercitando, senão passam a afirmar uma coisa e testar outra.
- **A ociosidade muda de tamanho.** "Cada bloco abre sala nova" já cria vaga ociosa; espalhar pode multiplicá-la. O card da unidade já mostra `vagas úteis / ociosas` — conferir se o número continua verdadeiro.

---

## 📄 Módulo Financeiro — persistência (histórico de remessas/transações)

**Status:** ⏳ **não iniciado, sem roadmap escrito.** É a Decisão D3 do roadmap já concluído
([`analises/roadmap-modulo-financeiro.yaml`](./analises/roadmap-modulo-financeiro.yaml), ver o
fechamento em
[`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md)),
que deixou o módulo Financeiro **100% stateless** de propósito: cada geração de remessa é download
direto do navegador, nada é gravado.
**Área:** módulo Financeiro — ver [`estrutura/modulos/financeiro/00-modulo.md`](./estrutura/modulos/financeiro/00-modulo.md)

Quando entrar, exige tabelas **namespaced** `financeiro_editais`/`financeiro_colaboradores`/
`financeiro_remessas`/`financeiro_transacoes`/`financeiro_unidades` — `editais` e `colaboradores`
já existem no gestaoconcurso com significado totalmente diferente (concurso × folha de pagamento
Financeiro), então não dá para reaproveitar o nome. RLS restrita a superadmin+financeiro, nos
moldes do resto do banco (nunca `USING(true)` — foi assim que a origem tinha ficado, com as
migrations desenhadas e nunca ligadas ao frontend).

---

## Modal de controle de coordenação em `/gerenciar-usuarios`

**Status:** ⏳ **não iniciado.** O roadmap foi criado em 2026-09-12 e **só foi registrado aqui em
2026-11-04** — ficou quase dois meses fora do backlog e fora do git.
**Área:** Auth e Permissões · roadmap [`analises/roadmap-modal-controle-coordenador.yaml`](./analises/roadmap-modal-controle-coordenador.yaml)

A coluna de provas coordenadas da tabela de usuários não comporta quem coordena muitas provas. O
roadmap leva essa informação para um modal por usuário, com duas decisões do usuário: **D1** o modal
lista cada vínculo de coordenação; **D2** **revogar sim, conceder não** — conceder continua exigindo
alocação de fato, pelo `CoordenadoresProvaDialog`.

⚠️ **Antes de executar, confira duas premissas:**

1. **O `medido_antes` do roadmap é anterior a 24/09.** O `useUsers.tsx` mudou depois disso (leitura
   em fatias contra o teto de 1000, e o papel de sistema passando a nascer de colaborador na v3.7.0).
   O formato `Record<string, string[]>` que o roadmap descreve precisa ser conferido no código.
2. 🔴 **"Revogar a última coordenação também tira o papel" está desenhado como mutation no hook.**
   São dois passos (apagar o vínculo, apagar o papel em `user_roles`) — o padrão "vários passos sem
   transação" do `CLAUDE.md` §8, e uma regra que só valeria pela tela (§2). O lugar é **RPC ou
   trigger**, com bateria SQL e controle positivo (revogar uma de duas mantém o papel).

---

## Refazer a página de treinamento do zero

**Status:** pendente — a página antiga foi **excluída** em 2026-07-25
**Área:** Aplicação de Provas (ver [`estrutura/modulos/aplicacao-provas/00-modulo.md`](./estrutura/modulos/aplicacao-provas/00-modulo.md))

A rota `/treinamento` e o `src/pages/Treinamento.tsx` (1547 linhas) foram removidos: o conteúdo estava envelhecido demais para valer um remendo, e um manual errado é pior que manual nenhum — ele *parece* autoridade. A decisão foi excluir agora e reescrever depois, do zero.

**O que era:** manual do usuário embutido no app, explicando o sistema tela por tela em JSX estático — texto corrido mais mockups desenhados à mão (cards de exemplo com dados literais no código). Não importava hook nenhum e não consultava o banco.

**Por que envelheceu sem ninguém ver:** descrevendo o sistema *por fora*, ela nunca quebrava build, teste ou lint ao ficar errada. O único detector era memória humana — e a página **não tinha link nenhum na UI** (estava em `prefixosRota` mas nunca nos `navLinks`), então só se chegava nela digitando a URL. Invisível para o usuário e para quem mantinha.

**O que a versão nova precisa resolver, além do conteúdo:**
1. **Um caminho até ela.** Sem entrada na navegação, a página não cumpre função — e some do radar de quem mantém.
2. **Uma âncora contra o drift.** A causa raiz é o texto não ter vínculo nenhum com o código que descreve. Vale considerar conteúdo fora do JSX (MDX/markdown versionado), capturas reais em vez de mockups à mão, ou pelo menos uma checagem no fechamento de tema. Se a solução for só "lembrar de atualizar", ela vai apodrecer de novo pelo mesmo motivo.
3. **A marca certa.** O título da antiga dizia *"Sistema de Cadastro de Colaboradores do DCIT"*, divergindo do FEVRE usado no resto da UI.

**Ponta solta:** `framer-motion` (`^12.27.0`, em `package.json`) era usado **só** por essa página e agora é dependência órfã. Manter, se a página nova for usar animação; remover, se não — decisão para o momento da reescrita.

O conteúdo antigo continua recuperável no histórico do git (última versão em `cd86219`; a exclusão é de 2026-07-25).

---

## Script para alternar o apontamento do banco (local ⇄ supabase.com)

**Status:** ⏳ **não iniciado** — desenho fechado em 2026-08-10
**Área:** Infraestrutura / ambiente local

Um script **gitignored** para apontar o `npm run dev` ao Supabase local ou ao projeto na nuvem, e voltar. Pedido do usuário em 2026-08-10, no dia em que o banco de produção passou a existir de verdade.

📋 O desenho completo — 6 etapas, 5 achados medidos e 6 riscos — está em [`analises/roadmap-alternar-apontamento-do-banco.yaml`](./analises/roadmap-alternar-apontamento-do-banco.yaml).

🔴 **Leia o R1 antes de executar.** Com o interruptor ligado, **todo clique escreve em produção** — um banco sem backup nenhum, onde importar candidatos é troca total (apaga a lista do edital inteira). Por isso o roadmap tem uma etapa só de guarda: faixa visível na tela e confirmação digitada.

🔵 **O achado que mais muda a leitura:** o mecanismo de alternância que a doc descrevia **não funcionava, e não funcionou por quase um mês**. Tanto o comentário dentro do `.env.local` quanto `desenvolvimento-local.md` diziam que basta esse arquivo existir ou não — mas apagá-lo caía no `.env`, que **também apontava para o Docker local**.

✅ **Metade disso fechou em 2026-09-12**, com a remoção do `.env` (item próprio, mais abaixo) e a correção dos dois textos falsos. **O que sobra, e é este item:** continua **não havendo caminho** para apontar o `dev` para a nuvem. A diferença é o modo de falhar — hoje, sem `.env.local`, o cliente fica sem `VITE_SUPABASE_URL` e **quebra alto**, em vez de falar com o banco errado em silêncio.

⚠️ **Este item absorvia o do `.env` da raiz** (achado A2 do bootstrap) — aquele fechou sozinho em 12/09, sem esperar por este.

---

## Monitoramento e teste de estresse (fora do repo)

**Status:** 🟡 **parcial, parado.** Roadmap criado em 2026-09-12 e **só registrado aqui em
2026-11-04**. O checkpoint diz que as fases 1, 2 e 3.1 foram feitas (código em `monitoramento/`, que está
no `.gitignore`), mas o YAML ainda marca todas as fases como pendentes — **os dois discordam**. Parou
esperando o usuário preencher `monitoramento/.env` e gerar o token.
**Área:** Infraestrutura · roadmap [`analises/roadmap-monitoramento-stress.yaml`](./analises/roadmap-monitoramento-stress.yaml)

🔵 **Fora do git por decisão do usuário (2026-11-04):** o código (`monitoramento/`) e o estado
(`my_rules/analises/checkpoint-monitoramento.md`) vivem só nesta máquina — só o roadmap é versionado.
Num checkout limpo, o checkpoint não existe; é ele que diz onde o trabalho parou.

Medir o comportamento de produção sob carga (CPU e conexões do Supabase, nginx da Hostinger) com
monitores próprios e Artillery, num servidor à parte que nunca sobe para produção.

🔴 **O alvo é PRODUÇÃO, no plano free.** A queda de 2026-09-10 mostrou que, travado, o projeto só
volta com restart — e o restart destrói a evidência. Uma carga de estresse pode reproduzir exatamente
isso, e o free não tem backup contínuo. Antes da fase 3.2: combinar janela, começar pequeno, só leitura,
e saber de antemão como restabelecer.

⚠️ **Premissa envelhecida no roadmap:** o `medido_antes` e a fase 3.2 miram a `colaboradoresAlocadosQuery`
e o `fetchAll` de `GerenciarColaboradoresProva` — **ambos saíram em 2026-09-12**, no mesmo dia em que o
roadmap nasceu, quando os pickers passaram a buscar no servidor pela RPC `buscar_colaboradores_para_alocacao`
(com `LIMIT`). Antes da 3.2, redefinir qual rota estressar, medindo no código de hoje.

---

# P6 — Dados que pedem conferência humana

Correção de dado real (bancário ou de autoria), sem regra que dispense uma pessoa.

---

## Sanear as chaves PIX e preencher `tipo_chave_pix`

**Status:** pendente — aberto em 2026-07-14, quando as colunas ganharam unicidade
**Área:** Colaboradores (ver [`estrutura/modulos/aplicacao-provas/colaboradores.md`](./estrutura/modulos/aplicacao-provas/colaboradores.md))

> ⚠️ **Números de 2026-07-14.** Em 2026-11-04, no banco local (cópia de produção), são **821** colaboradores,
> **623** com chave PIX e ainda **0** com `tipo_chave_pix`. As subcontagens abaixo (94 mistos, 397 com 11
> dígitos, 193/188) **não foram remedidas** — meça antes de desenhar o saneamento.

Duas pontas soltas deixadas de propósito pela migration `20260714163506_*`:

1. **Os formatos da chave PIX estão misturados.** Das 565 chaves preenchidas, 94 estão em formatos mistos (`127.139.687-47` ao lado de `12713968747`, `(24)998491988`, chaves com espaço no meio) e **uma tem 21 dígitos** — não é chave válida de tipo nenhum. O índice único atual normaliza caixa e espaço nas pontas, mas **não** pontuação: a mesma chave escrita de dois jeitos ainda entra duas vezes. Sanear isso é reescrever dado bancário de 565 pessoas e pede conferência humana.

2. **`tipo_chave_pix` está `NULL` nas 771 linhas.** O tipo **não é inferível** do valor: 397 chaves têm 11 dígitos, e 11 dígitos é tanto CPF quanto celular com DDD (193 batem com o CPF da própria pessoa, 188 com o telefone dela, e o resto com nenhum dos dois). Adivinhar errado é errar o destino de um pagamento. Preencher exige ou confirmação humana, ou uma regra de negócio que ainda não existe.

Enquanto (2) não estiver resolvido, não é possível criar o `CHECK` que amarra "tem chave ⇒ tem tipo".

**Atenção:** qualquer correção em massa aqui é **operação de dados** e esbarra na regra do seed — migration não alcança dado que entra pelo dump (ver [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md)).

---

# Registros — não são trabalho

Decisões aceitas e anotadas para não virarem achado repetido, e o que não tem desenho nem ordem.

---

## O selo "não confirmada" ficou inalcançável — por decisão, não por descuido

**Status:** consequência aceita do filtro de pagamento (2026-08-01). Não é defeito; está aqui para não virar achado repetido.
**Área:** Candidatos

Desde que a importação passa a trazer **só quem pagou a inscrição**, todo `candidato` gravado tem `confirmado = true`. Com isso, dois pedaços de UI deixaram de poder disparar:

- `src/pages/Candidatos.tsx` — `{!c.confirmado && <Badge>não confirmada</Badge>}` na listagem;
- a linha `"Inscrição confirmada"` da ficha, que passa a dizer sempre "Sim".

**Decisão do usuário: os dois FICAM.** A coluna segue no banco como procedência, e se o filtro for afrouxado eles voltam a valer sozinhos, sem ninguém precisar reescrevê-los.

⚠️ Isto **contraria** a regra da casa "guarda que não pode disparar é armadilha", e a contrariedade é consciente — por isso está escrito aqui. Quem auditar a UI de Candidatos vai reencontrar os dois; não são achado novo.

⚠️ **Foi considerada e rejeitada** uma `CHECK (confirmado = true)` em `candidatos`: a regra é sobre *o que a importação seleciona*, não sobre *o que um candidato pode ser*. Um não-pagante gravado não é dado incoerente, e a CHECK fecharia a porta para sempre.

---

## Temas de infraestrutura — futuro distante

**Status:** anotados, sem desenho e sem ordem definida. Nenhum tem dono nem medição ainda.

- ~~Rate Limiting~~ → saiu daqui em 2026-08-13 para roadmap próprio; o que sobra dele virou item no grupo P1 (2026-11-04).
- Caching & CDN
- Load Balancing & Scaling
- Error Tracking & Logs
- Availability & Recovery

---

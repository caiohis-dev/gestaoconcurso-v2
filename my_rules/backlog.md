# Backlog — Implementações Futuras e Pendentes

Lista de trabalho planejado, ainda não iniciado. **Item concluído sai daqui** — o registro completo dele (o que foi medido, a premissa errada, o que a decisão custou) vai para [`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md), e fica só uma linha na tabela abaixo. O que o sistema **é** vive em [`estrutura/`](./estrutura/).

> **Última auditoria contra o código: 2026-07-26**, com correções pontuais depois. Cada item foi conferido no código e no banco local; o que estava desatualizado está marcado no próprio item.
>
> ⚠️ **Números envelhecem — confira na hora.** Este bloco já trazia dois errados: dizia **95 migrations** (são **106** em 31/07) e **`anon` ainda com `TRUNCATE` em 23 tabelas**, o que **deixou de valer** na mesma data — `anon` não tem privilégio nenhum em `public`. Seguem medidos e válidos: **771 colaboradores** (565 com chave PIX, **0** com `tipo_chave_pix`) e as três FKs de `funcao_id` em `SET NULL`/`CASCADE`/`CASCADE`.

---

## Concluídos — o histórico saiu daqui

Os **15** blocos de temas fechados foram movidos em 2026-07-31 para
[`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md),
**na íntegra**. Eles ocupavam 65% deste arquivo e diluíam o que falta.

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

| ✅ 16–17/09 | a **v3 do módulo Editais**: 11 das 12 fatias entregues, e as duas que faltavam viraram itens aqui embaixo |
| ✅ 21/09 | o defeito do `padStart` antes do `length` (fixo em 02/08 só na `check-cpf-colaborador`) sobrevivia em 3 outras EFs — `reivindicar-acesso`, `incluir-email-cadastro`, `public-create-colaborador`; consolidado em `_shared/cpf.ts` |
| ✅ 24/09 | módulo Financeiro (gerador CNAB240/PIX) acoplado por inteiro — papel + guarda de acesso, lógica de negócio portada e testada, e UI real conectada; persistência ficou fora por decisão (item novo abaixo) |
| ✅ 24/09 | papel de sistema passou a nascer de COLABORADOR: `create-admin` (que sobrescrevia a senha de quem já tinha conta) virou `conceder-papel-sistema`, e colaborador + financeiro passou a ver o hub — **no ar na v3.7.0**, com a `create-admin` apagada de produção |
| ✅ 24/09 | as ressalvas do "admin preenche o e-mail e o colaborador se reivindica": o teto do `acesso` folgou para 5/10 min com frase fixa (**v3.7.3**), e as 12 CHECKs de `colaboradores` passaram a chegar traduzidas no cadastro e na edição |
| ✅ 24/09 | o `PerfilColaborador` passou a mostrar a recusa do banco: a frase `P0001` das RPCs (que era descartada, inclusive a da duplicidade) e as CHECKs traduzidas — o ramo `23505` da tela nunca rodava |

---

## ⏳ Pendente da v3.7.0: o passo do convite não rodou

❌ *Aqui havia, por algumas horas de 2026-09-24, um item "`create-coordenador` ainda publicada em produção". **Premissa falsa**, a quinta deste backlog: conferido pela lista oficial de funções do projeto, ela **já não existia** lá (404). O item saiu no mesmo dia, sem nada a executar — ver `integracoes-externas.md`.*

⚠️ O passo do convite no teste da `conceder-papel-sistema` não rodou (`EF_TESTE_ENVIA_EMAIL=1`, envia e-mail real para domínio `.invalid`). O caminho que ele cobre (conta nascendo por invite, vínculo, trilha) é o que a `reivindicar-acesso` já exercita em produção; a parte nova é o INSERT do papel depois.

---

## ⏳ `update_meu_colaborador`: frase de duplicidade imprecisa e `LPAD` antes do tamanho

**Status:** ⏳ aberto em 2026-09-24, medido ao consertar as mensagens do `PerfilColaborador`.
**Área:** [`estrutura/modulos/aplicacao-provas/colaboradores.md`](./estrutura/modulos/aplicacao-provas/colaboradores.md) — conserto é **migration**

A RPC que o colaborador usa para editar o próprio cadastro tem dois defeitos, ambos no banco:

1. **O `EXCEPTION WHEN unique_violation` responde sempre *"Este e-mail ou chave PIX já está em
   uso por outro colaborador."*** — mas os índices únicos são **quatro** (CPF, PIS, e-mail, PIX),
   e o colaborador edita o CPF nessa tela. CPF repetido recebe a frase errada. O conserto é ler
   `CONSTRAINT_NAME` via `GET STACKED DIAGNOSTICS` e nomear o campo.
2. **`LPAD(…, 11, '0')` roda ANTES do `length <> 11`** — o mesmo defeito corrigido em 3 Edge
   Functions em 2026-09-20 (`_shared/cpf.ts`). `LPAD` também **trunca**: 3 dígitos viram
   `00000000123` e 12 dígitos viram os 11 primeiros, e os dois passam. A tela exige 11 dígitos,
   então só chamada direta à RPC chega aqui — mas a RPC é a barreira, não a tela. Também não há
   dígito verificador.

⚠️ Mudar a mensagem muda o texto que o `PerfilColaborador` mostra **como está** (`P0001`); ver o
teste *"a duplicidade relançada pela RPC"* em `PerfilColaborador.ui.test.tsx`.

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

## ✅ CONCLUÍDO 2026-09-20 — carimbo de "Último Acesso" + trilha de envio do link

**Status:** ✅ **AS DUAS PARTES executadas em 2026-09-20** — o carimbo (migration
`20260921002249_carimbar_ultimo_acesso_no_login.sql`) e a trilha de envio (migration `20260921005259_trilha_envio_link_acesso.sql`,
tabela `log_envio_link_acesso`). Aberto ao investigar por que colaboradores que acabavam de informar
o próprio e-mail apareciam como *"Nunca acessou"*.
**Área:** Auth e Permissões · estudo completo em
[`analises/analise-ultimo-acesso-e-convite.md`](./analises/analise-ultimo-acesso-e-convite.md)

`colaboradores.colab_ultimo_acesso` teve os seus dois únicos escritores dropados na migration
`20260715125720_drop_rpcs_colaborador_antigas.sql` (eram do portal de código de 4 dígitos). A
**leitura ficou** — `ColaboradoresList` e `PainelDadosColaboradores` —, e ninguém notou porque a
coluna continuou existindo com dado dentro.

🔴 **Medido em PRODUÇÃO em 2026-09-20: 263 de 263.** Das **274** contas vinculadas, **263** entraram
de verdade — e **todas as 263** estão descritas errado: **71** como *"Nunca acessou"* e **192** com
uma data congelada de junho/julho. O carimbo mais recente da coluna é **2026-07-09**; o login mais
recente de verdade é do **próprio dia da medição, 23:43**. ⚠️ Não é a maioria, é a totalidade — e o
recurso de *ordenar* por último acesso, que existe justamente para achar quem nunca entrou, ordena
sobre `null`.

🔴 **Confirmado em PRODUÇÃO no mesmo dia, e não é teórico:** a colaboradora do aviso de
autosserviço (`patricia…@gmail.com`) abriu o link **42 s** depois do envio e entrou com a senha
própria **2 min 27 s** depois — e a tela diz *"Nunca acessou"*. 🟢 O mesmo caso prova, de quebra,
que o secret `SITE_URL` de produção está correto e que a entrega pela Hostinger funciona ponta a
ponta para destinatário real.

### O conserto

1. ✅ **FEITO — carimbar no trigger que já existe.** `vincular_colaborador_no_signin` passou a gravar
   `colab_ultimo_acesso = NEW.last_sign_in_at`. 🔴 **Num bloco `EXCEPTION` PRÓPRIO, não no do
   vínculo** — achado da implementação: fundidos, a exceção do carimbo anula a subtransação e
   **desfaz o vínculo junto**, criando uma perda silenciosa nova. O caso 14 da bateria falsifica a
   variante fundida. ⚠️ Carimba só quando `last_sign_in_at` **muda**: confirmar e-mail não é acesso.
2. 🔵 **SEM BACKFILL — decisão dele em 2026-09-20:** *"o erro de informação 'nunca acessou' não
   precisa ser corrigido para informações passadas"*. Cada pessoa se corrige sozinha no primeiro
   login seguinte. ⚠️ **Não reabra propondo backfill "para deixar consistente"** — foi recusado com
   motivo, e recusá-lo elimina o único passo manual em produção do conserto (`seed.pos.sql` não
   roda sozinho lá; esquecê-lo seria falha silenciosa). O custo aceito: os 192 com data congelada
   seguem exibindo junho/julho até logarem de novo.
3. ✅ **FEITO — a trilha de envio do link.** Tabela `log_envio_link_acesso`, escrita num ponto único dentro de `enviarLinkAcesso` (não em cada uma das 5 EFs chamadoras — mesma lição do `registrarFalhaDeEnvio`). Best-effort, nunca derruba o envio real; falsificado com dublê que sempre falha no INSERT, e provado de ponta a ponta contra o Auth local (sem dublê nenhum). RLS: SELECT só admin, com controle positivo e negativo. ⚠️ Sem backfill — só vale a partir de 20/09. Ver `analises/analise-ultimo-acesso-e-convite.md` §6.2.

### Como verificar (controle positivo obrigatório)

🔴 **O controle positivo do carimbo são os 8 casos ANTIGOS da bateria**, não os novos: o carimbo foi
acrescentado dentro da função do vínculo, então provar que ele grava é metade — a outra é provar que
o vínculo não regrediu. Os 14 passam desde 2026-09-20, depois de `db reset` completo.

Provar que passou a carimbar é metade. A outra é
[`docs/consulta-acesso-colaborador.sql`](../docs/consulta-acesso-colaborador.sql) continuar
distinguindo os quatro estados — em especial **convite pendente** (`confirmation_sent_at`
preenchido) de **só abriu o link** (delta < 1 s entre `email_confirmed_at` e `last_sign_in_at`).
⚠️ O limiar é **1 segundo e foi medido**, não arbitrado: a distribuição é bimodal (7 contas em 4–13
ms, nada até 24,8 s, 40 contas acima). Um corte de 2 minutos classifica errado quem criou a senha e
logou em seguida — o caminho normal.

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

⏳ **Numerar ANEXO e QUADRO** continua na entrada própria abaixo, para a fatia de exportação.

---

## 📄 O número do ANEXO e do QUADRO são referência calculada, e não há mecanismo

**Status:** ⏳ aberto em 2026-09-18, na rodada 3 do edital padrão.
**Área:** módulo Editais — ver [`estrutura/modulos/editais/00-modulo.md`](./estrutura/modulos/editais/00-modulo.md)

**Medido nos três editais:** o conteúdo programático é o **Anexo I** no 002 e no 003, e o
**Anexo II** no 004 — porque lá o Anexo I é a abrangência territorial. É exatamente o problema
que a numeração calculada de capítulo resolve, um nível abaixo: elemento pós-textual condicional
que entra desloca todos os seguintes.

🔴 **E o mesmo vale para os QUADROS, medido na rodada 4:**

| | Quadro I | Quadro II | Quadro III |
|---|---|---|---|
| 002 | cargos | provas | títulos |
| 003 | cargos | provas | — |
| 004 | cargos | **vagas por UBSF** | vagas do 2º cargo |

E o Edital 004 chama de **"Quadro II" tanto as vagas de ACS quanto a tabela de composição da
prova** — dois quadros com o mesmo número no mesmo documento publicado.

Hoje não há mecanismo para nenhum dos dois. `{{cap:anexos}}` não serve — `anexos` é
`numerado: false` no catálogo, e resolveria para `[?anexos]`.

**Paliativo em uso:** o modelo não cita o número (*"como anexo deste Edital"*), o que é
impreciso e nunca falso. ⚠️ Mas o apontamento acontece **duas vezes por edital** (item 1.6 e o
capítulo da prova), e o publicado cita o número nas duas.

**O conserto natural é da fatia 12 (exportação)**, que é quem monta os anexos e portanto sabe
quantos há e em que ordem: ela pode expor uma numeração de anexo como expõe a de capítulo, e aí
um `{{anexo:conteudo_programatico}}` resolve. Fazer antes disso seria numerar uma lista que
ainda não existe.

---

## 📄 Editais v3, fatia 12 — exportação (PDF / Markdown / JSON)

**Status:** ⏳ **não iniciada, por decisão do usuário em 2026-09-17** — as fatias 1 a 11 foram entregues e esta foi deixada para o backlog. O roadmap é [`analises/roadmap-editais-exportacao.yaml`](./analises/roadmap-editais-exportacao.yaml), ainda em esboço.
**Área:** módulo Editais — ver [`estrutura/modulos/editais/00-modulo.md`](./estrutura/modulos/editais/00-modulo.md)

🔴 **É a fatia que fecha o objetivo do módulo.** As 11 primeiras montam o documento no banco; esta é a que o tira de lá. Sem ela, o edital continua sendo redigido no Word e o sistema é só um formulário — o que o `00-Plano-v3.md` chama de "gerar o edital publicável" não acontece.

⚠️ **E é onde duas dívidas registradas deixam de ser hipótese:**

1. **O e-mail duplicado** (`regras_vista_prova.email_solicitacao` × `edital_canais_atendimento`) passa a sair impresso **no mesmo documento**, em capítulos diferentes. Hoje a divergência é um aviso de tela; na exportação vira erro visível no PDF. Ver [`estrutura/transversais/invariantes.md`](./estrutura/transversais/invariantes.md).
2. **Os dois quadros gerados não reproduzem a forma publicada** — o Quadro II de provas e os Quadros III/IV de títulos saem com uma linha por cargo, onde o Edital 002 agrupa. Foi **decisão do usuário** (não agrupar), e a exportação é onde ela aparece.

⚠️ **O que já está pronto e ela consome:** a numeração calculada de capítulo e artigo, a resolução de `{{cap:}}` e `{{item:}}`, o `segmentarNegrito`, e as cinco fontes de quadro renderizando de verdade. A prévia em `EditalStudio` já monta o documento na tela — a exportação é levá-lo para fora, não remontá-lo.

🔴 **A armadilha que o roadmap da fatia 7 deixou avisada:** o Anexo de abrangência tem **843 logradouros** num edital, 84% do teto de 1.000 do PostgREST. A leitura já passa por `buscar-em-fatias`; **a exportação não pode contorná-la** — um select solto devolveria 1.000 e o anexo sairia com uma rua faltando, sem erro nenhum.

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

## Candidatos — o que o módulo deixou em aberto

**Status:** o módulo está pronto e verificado (2026-07-27). Estes são os fios soltos que ele **não** resolveu, e nenhum bloqueia nada hoje.
**Área:** módulo Candidatos — ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md)

1. ~~**Não há vínculo entre candidato e prova, unidade ou sala.**~~ ✅ **CONCLUÍDO em 2026-08-04: virou o módulo Alocação de Candidatos** (`candidatos_alocacao` + distribuição por cargo + ajuste manual), exatamente como o item pedia — feature nova com desenho próprio, tabela nova, nada pendurado em `candidatos`. Contrato em [`estrutura/modulos/alocacao-candidatos/00-modulo.md`](./estrutura/modulos/alocacao-candidatos/00-modulo.md); registro em [`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md).

   ⚠️ **O que o item destravava segue como decisão separada, ainda não tomada:** com o vínculo existindo, uma prova que aplique só um recorte do edital passou a ser *exprimível* — mas a fonte única do nº de inscritos **não foi reaberta**, e a distribuição assume a mesma premissa de 02/08 (todo inscrito do edital entra). Reabrir é pelo vínculo, **nunca** por campo digitado de volta no `ProvaDialog`.

2. ✅ **`editais.n_candidatos` e a contagem real não conversavam** — **CONCLUÍDO em 2026-08-02**, no mesmo dia em que virou item próprio. A contagem real de `candidatos` é a fonte única em toda tela; os dois números digitados à mão saíram dos formulários. Registro em [`analises/concluidos/backlog-itens-concluidos.md`](./analises/concluidos/backlog-itens-concluidos.md).

3. **`CadastroLote.tsx` continua lendo planilha do jeito errado** — modo objeto (perde coluna de cabeçalho repetido) e sem `raw: false` (come zero à esquerda). Não deu problema porque o template de colaboradores não tem cabeçalho repetido, mas é a mesma classe de defeito que `candidatos-import.ts` resolve. Migrar aquele fluxo para a leitura por índice é dívida conhecida.

---

## Completar a suíte de testes (Vitest) — onde paramos e o que falta

**Status:** parcial — a suíte existe e roda desde 2026-07-25; a cobertura está **incompleta por decisão**, não por esquecimento
**Área:** Infraestrutura / transversal (ver [`estrutura/transversais/testes.md`](./estrutura/transversais/testes.md) para infra, convenções e as **7 armadilhas**)

Este item é o marco: quem retomar os testes começa por aqui. **Leia `testes.md` antes de escrever teste novo** — as armadilhas ali custaram tempo real (a sequência do mock consumida pela listagem; `.at(-1)` pegando o refetch e não a mutation; `act()` no que atualiza provider; fake timers com `shouldAdvanceTime`; o caminho do `pagehide`, que não passa pelo mock do Supabase; **timeout usado como resposta**, que passou isolado e falhou na suíte cheia; e o `min`/`max` do input barrando **antes** do Zod em formulário com submit).

### Onde paramos (2026-07-26)

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

**2. Edge Functions — tema próprio, não continuação desta suíte.** São 8 mais `_shared/`, rodam em Deno e estão fora do alcance do Vitest como está montado; exige decisão de ferramenta (Deno test) antes de qualquer código. É onde vive a lógica mais sensível: anti-enumeração, rate limit, cooldown.

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

- **Mudança de produção feita para viabilizar os testes:** os 9 schemas Zod passaram a ser `export`ados dos componentes (**8 arquivos**; só a palavra `export`). Custo aceito: os 8 entram nos avisos de `react-refresh/only-export-components` — que hoje somam **19 no repo**, a maioria pré-existente (`components/ui/*`, hooks e páginas que exportam constantes).
- **Baseline de lint do repo: 93 problemas (69 erros, 24 avisos)** por `npm run lint` — conferido em 2026-07-26. Se subir, é coisa nova. (Atenção: `npx eslint src` dá **90**; a diferença são arquivos fora de `src`.)
- **Enquanto não houver CI**, fechar tema inclui rodar à mão: `npm test`, `npx tsc --noEmit -p tsconfig.app.json` e `npm run build`.

### A automação ficou para o fim, por decisão

**O usuário decidiu em 2026-07-25 deixar o CI para o final.** Não é esquecimento — está registrado no item próprio abaixo ("Rodar a suíte de testes automaticamente"), que segue válido e continua sendo **o de maior alavancagem da lista**. A consequência de a decisão valer: **nada roda a suíte sozinho**, então cada tema fechado depende de alguém lembrar.

⚠️ **O custo dessa decisão cresceu.** Em 25/07 eram 376 testes; hoje são **743**, e as três camadas fechadas (hooks, diálogos, guards) só protegem quem as executa. O argumento original — "escrever mais teste rende menos até o CI existir" — agora aponta com mais força para o CI do que para a próxima camada de cobertura.

---

## 🔴 Selects sem teto: o PostgREST trunca em 1000 EM SILÊNCIO

Achado em 2026-09-10, ao consertar `/colaboradores`. `supabase/config.toml:22` define
`max_rows = 1000` e o PostgREST **corta a resposta sem erro nenhum** — a tela recebe
1.000 linhas achando que recebeu todas. ⚠️ Esse é o valor do ambiente **local**; o de
produção fica nas API settings do dashboard e precisa ser conferido lá.

`/colaboradores` saiu da lista (passou a buscar sob demanda, paginado). O resto continua:

| Onde | Tabela | Por que dói |
|---|---|---|
| ✅ ~~`useFuncoesAssociadas.tsx`~~ | — | **FECHADO em 2026-09-10** pela RPC `funcoes_em_uso`: 42,8 kB em 3 requisições viraram 680 bytes em uma, e o teto de 1000 deixou de alcançar a tela |
| ✅ ~~`OcorrenciasProva.tsx`~~ (picker de substituto) | — | **FECHADO em 2026-09-12** pela RPC `buscar_colaboradores_para_alocacao` |
| `Dashboard.tsx:81-87` e `:109-113` | `colaboradores_prova`, `sala_prova` | agrega no cliente (`new Set(...).size`, soma). Acima de 1000 o card mostra número **errado, sem erro**. Medido em 12/09: 555 e 42 linhas — o que sobra de risco ativo nesta tabela |
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

## ✅ `useFuncoesAssociadas` — 42 kB para calcular booleanos — FECHADO em 2026-09-10

**Status:** ✅ **resolvido no mesmo dia**, pela RPC `funcoes_em_uso` (migration `20260911022341`) — 42,8 kB em 3 requisições viraram **680 bytes em uma**, e a tela saiu do alcance do teto de 1000. Bateria em `docs/bateria-funcoes-em-uso.sql`, rodada. **Fica aqui, e não em `concluidos/`, pelo que a correção da premissa ensina.** Aberto em 2026-09-10. 🔴 **A primeira versão deste item afirmava coisa errada, e a correção é a parte que vale ler.**
**Área:** Aplicação de Provas — `/funcoes-colaboradores`

Eu escrevi, ao abrir o item: *"o resultado vira um `Set` que decide se uma função **pode ser excluída**. Truncar libera exclusão de função EM USO — é bug de correção, não de performance."* **Medido no mesmo dia, é falso nos três pontos:**

| Afirmado | Medido |
|---|---|
| truncar libera exclusão de função em uso | as **3 FKs são `RESTRICT`** — o banco recusa |
| é bug de correção | a UI **já traduz** o `23503` (`useFuncoesColaboradores.tsx:42`) |
| risco ativo | 554 / 186 / 24 linhas — nenhuma perto do teto de 1000 |

⚠️ **E a primeira tentativa de provar a recusa provou a regra ERRADA.** Apagar "Coordenador Geral" foi recusado por `prevent_system_funcao_changes()` ("não é permitido excluir funções básicas do sistema"), não pela FK — é o padrão de **ofuscação** que o `CLAUDE.md` §8 descreve. Só com uma função `cargo_editavel = true` **e** em uso a FK apareceu, nomeada: `colaboradores_prova_funcao_id_fkey`. **Ao provar uma recusa, leia o NOME de quem barrou.**

**O que sobra, e é o item de verdade:** `useFuncoesAssociadas` faz **3 consultas sem filtro** (42.778 bytes medidos) para produzir um `Set` de ids. O `Set` só desabilita o botão de excluir e escreve o tooltip. Se um dia passar de 1000 linhas, o sintoma é o botão **não** desabilitar: o usuário clica, o banco recusa, e ele vê a mensagem traduzida. **Degradação de UX, não perda de dado.**

**A saída é a mesma de `totais_da_prova` (10/09):** uma RPC que devolve os ids das funções em uso, agregando no banco. Passa de 42,8 kB em 3 requisições para menos de 1 kB em uma, e fica **imune ao teto de 1000** — que é o único jeito de fechar o risco futuro, porque nenhum conserto no cliente o alcança.

## Defaults do `QueryClient`: `staleTime: 0` e refetch a cada foco de janela

`src/App.tsx:38` é `new QueryClient()` **sem `defaultOptions`**, então toda query do app
é stale na hora e **refaz a cada alt-tab de volta**. Com ~180 ms de RTT para `us-west-2`,
pesa em toda tela.

🔴 **Não é mudança de uma linha.** `GerenciarSalasDistribuidas.tsx:58-62` tem estado local
escrito *assumindo* esse comportamento, e `GerenciarSalasDistribuidas.ui.test.tsx:185`
cobre isso. Mexer no global exige varrer quem depende dele. Único hook que já define
`staleTime` por conta própria: `useBancos.tsx:22` (1h).

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

## Rodar a suíte de testes automaticamente (CI e/ou pre-commit)

**Status:** pendente — aberto em 2026-07-25, junto com a introdução dos testes. **Adiado por decisão do usuário no mesmo dia: "deixar o CI para o final."** Segue sendo o item de maior alavancagem da lista; o adiamento é escolha consciente de ordem, não reavaliação do valor.
**Área:** Infraestrutura (ver [`estrutura/transversais/arquitetura-geral.md`](./estrutura/transversais/arquitetura-geral.md))

O projeto ganhou uma suíte de regressão em 2026-07-25 (Vitest + React Testing Library, `npm test`), mas **nada a executa sozinho**: não há `.github/workflows/`, não há hook de pre-commit. Os testes só rodam quando alguém digita o comando.

**Por que isso não é detalhe:** uma suíte que ninguém executa não previne regressão nenhuma. E este repositório já pagou por isso — o `tsc` ficou **vermelho por 11 dias** por causa de um import morto deixado na subetapa 2A (`useOnlineColaboradores` em `ColaboradoresList.tsx`), atravessando os temas do hub e de Editais sem ninguém notar. `npm run build` sozinho não pegava, porque o esbuild descarta import não usado antes de resolver o módulo. Verificação manual depende de lembrar.

**O trabalho:** um workflow rodando `npm test`, `npx tsc --noEmit -p tsconfig.app.json` e `npm run build` a cada push/PR. Opcionalmente um pre-commit (husky + lint-staged) para o feedback rápido. **Atenção ao escolher o gate do lint:** o repo tem 69 erros de eslint pré-existentes, então `npm run lint` não pode ser bloqueante hoje sem um passe de saneamento antes — ou trave só os arquivos alterados.

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

## Refatorar diálogo "Nova Ocorrência" para modelo wizard

**Status:** pendente
**Área:** Ocorrências (ver [`estrutura/modulos/aplicacao-provas/ocorrencias.md`](./estrutura/modulos/aplicacao-provas/ocorrencias.md))

Refatorar o diálogo de Nova Ocorrência (`src/pages/OcorrenciasProva.tsx`) para um fluxo em wizard (passos), em vez do formulário único atual.

Junto com a refatoração, **corrigir a funcionalidade de "Faltou"**: quando uma ocorrência marca que o colaborador faltou, ele deve ser **retirado da unidade daquela prova** (o vínculo em `colaboradores_prova` some para aquela prova+unidade). Hoje esse efeito não acontece.

> ⚠️ **Corrigido na auditoria de 2026-07-26 — não existe "Faltou" no modelo.** `tipo_ocorrencia` é **texto livre**: o campo é um `Input` cujo placeholder apenas sugere *"Ex: Atraso, Falta, Elogio"*. Não há enum, lista fechada nem flag. O que existe de estruturado é `substituido` (0/1) com `substituto_id`.
>
> Consequência para quem for implementar: **não há em que se apoiar**. O primeiro passo é tornar o tipo estruturado (select com valores fixos, ou coluna própria), senão a regra dependeria de casar string digitada à mão — que muda com a grafia de quem preenche.

---

## ✅ `finalizar_prova` / `reabrir_prova` confiavam no `p_user_id` do chamador — FECHADO em 2026-09-12

**Status:** ✅ **resolvido**, migration `20260912191749_finalizacao_por_auth_uid.sql`. Aberto em 2026-09-08, medido e adiado por decisão do usuário; executado em 12/09. **Fica aqui, e não em `concluidos/`, pelo que a premissa incompleta ensina.**

> ✅ **O que foi feito:** `p_user_id` foi **removido da assinatura** das quatro RPCs, que passaram a ler `auth.uid()` — vinda do JWT, que o cliente não escolhe. Manter o parâmetro e ignorá-lo deixaria no contrato um argumento que parece autorizar e não autoriza.
>
> 🔵 **A política das duas de PROVA mudou, por decisão do usuário:** passou a ser **superadmin OU o criador**, alinhando com o que as `_unidade` já faziam. O motivo é operacional e foi medido: as 2 provas do banco foram criadas por uma admin que **não** é superadmin, então nem as contas superadmin conseguiam finalizá-las — se aquela pessoa saísse, ninguém socorria. A política das duas `_unidade` **não mudou**.
>
> 🔴 **A NOTA ABAIXO ESTAVA INCOMPLETA, e isso mudou o conserto.** Ela descreve as quatro como "comparam `created_by` com `p_user_id`" — exato só para as duas de PROVA. Medido no corpo de cada uma antes de reescrever, as `_unidade` já tinham regras mais ricas **e diferentes entre si**: `finalizar_prova_unidade` aceitava superadmin OU criador OU **coordenador da prova** (ramo usado de verdade — 2 das 11 unidades finalizadas foram por coordenadores), e `reabrir_prova_unidade` aceitava superadmin OU **quem finalizou aquela unidade**. Reescrever as quatro com a mesma regra teria tirado acesso de coordenador no dia da prova.
>
> ⚠️ **E a previsão de que "os testes que exercitam essas RPCs vão cair" NÃO se cumpriu: nenhum caiu.** Ninguém guardava o contrato — as menções em `guards.test.tsx` são uma lista de nomes para o mock, e as outras são comentários. O `tsc` também não guarda: reintroduzir `p_user_id` na chamada passa limpo (medido). A testemunha que faltava virou **`docs/bateria-finalizacao-autorizacao.sql`** — 9 casos, com controle positivo e falsificação.

**Status original (2026-09-08):** aberto, medido e **deliberadamente adiado** (decisão do usuário no mesmo dia). O acesso **anônimo** foi fechado; isto é o que sobra, e vale para usuário **logado**.
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

As quatro funções de finalização (`finalizar_prova`, `reabrir_prova`, e as `_unidade`) **não consultam `auth.uid()`**. Elas comparam o `created_by` da prova com **`p_user_id`, que é parâmetro fornecido pelo próprio chamador**:

```sql
IF v_created_by != p_user_id THEN RAISE EXCEPTION 'Apenas o usuário que criou a prova...'
```

Isso não é autorização — é uma conferência que o atacante controla dos dois lados. **Qualquer usuário autenticado** que saiba o `prova_id` e o `created_by` finaliza (ou reabre) prova alheia.

**O conserto foi trocar o parâmetro por `auth.uid()`**, mudando a assinatura: os quatro chamadores (`GerenciarProva.tsx` e `GerenciarColaboradoresProva.tsx`) deixaram de enviar `p_user_id`. ⚠️ Previa-se que "os testes que exercitam essas RPCs vão cair" — **nenhum caiu**, porque nenhum afirmava o corpo da chamada.

⚠️ A pergunta "a regra pretendida é mesmo 'só o criador'?" foi levada ao usuário antes de codificar, e a resposta foi **não**: passou a ser superadmin OU criador.

---

## ✅ `anon` alcançava 24 funções por RPC — FECHADO em 2026-09-08

**Status:** ✅ resolvido — migration `20260908231620_revogar_execute_de_anon_em_funcoes.sql`. Fica aqui só como registro; o detalhe está no cabeçalho da própria migration.

Achado de raspão ao desenhar o keep-alive, e **a premissa estava certa** (ao contrário das 4 vezes citadas no CLAUDE.md §1) — mas o **tamanho** só apareceu ao medir: das 53 funções de `public`, **38** eram executáveis por `anon`; tirando as de trigger, **24 chamáveis por RPC** com a chave publishable, que é pública.

**O que a medição corrigiu na hipótese original:**
- As `SECURITY INVOKER` **já estavam protegidas** pelos grants de tabela de 31/07. O buraco eram as **20 `SECURITY DEFINER`**, que rodam como dono e ignoram esse revoke.
- 🔴 **`verify_user_password` era um oráculo de enumeração de contas** e **nunca conferiu senha** (`p_password` não era lido). O bug: `v_user_id != auth.uid()` com `auth.uid()` nulo dá **`NULL`**, o `IF` não dispara e cai em `RETURN TRUE`. Era **órfã** — foi dropada.
- ⚠️ **Dois alarmes meus caíram ao medir:** `assign_coordenador_role` **não** era escalada de privilégio (a guarda funciona porque `has_role` usa `SELECT EXISTS`, que devolve `false` e nunca `NULL`), e `salvar_salas_distribuidas` tem guarda real de admin. `get_coordenador_colaboradores` vazava **UUIDs**, não PII.

Verificado com controle positivo nas duas metades: `anon` foi de 38 para **0**, `authenticated` manteve 51 de 52 (a exceção é o keep-alive, de propósito), e por HTTP o `anon` passou a levar `42501 permission denied for function`.

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

## O papel `colaborador` sobrevive à exclusão da linha de `colaboradores`

**Status:** aberto em 2026-09-18, ao mandar o colaborador sem gestão para `/perfil-colaborador`
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

`handle_new_user` **concede** o papel `colaborador` quando o e-mail da conta nova casa com um cadastro, mas **nada o revoga** quando aquela linha de `colaboradores` é apagada. A FK `colaboradores.user_id` é `ON DELETE SET NULL` — ela protege a conta, não o papel.

**Quem fica nesse estado cai num lugar que só existe para ele:** `/perfil-colaborador` renderiza o ramo "cadastro não localizado", porque `get_meu_colaborador` não acha nada. Medido em 2026-09-18: **1 conta em 53** (de teste, criada em 15/09, nunca logou).

⚠️ **Passou a importar em 18/09**, quando o redirecionamento deixou de ser teórico: antes ninguém era mandado para a página, agora todo colaborador sem gestão é. O sintoma agudo — o **beco sem saída**, sem botão "Sair", com `/auth` rebatendo quem está logado e só o timeout de 5 min como saída — **foi corrigido no mesmo passe**. O que sobra é a causa: o papel mente sobre o que a pessoa é.

**O conserto é de banco, não de tela** (§2 do `CLAUDE.md`): um trigger `AFTER DELETE` em `colaboradores` que remova o papel `colaborador` do `user_id` daquela linha. Duas coisas a medir antes: se alguém **reaproveita** o papel entre cadastros (o `SET NULL` sugere que a conta pode ser recadastrada) e se há linha com o papel sem conta. **Controle positivo obrigatório:** apagar um cadastro revoga o papel **e** a exclusão de um colaborador sem conta continua passando.

---

## Troca de e-mail de conta confirmada (estado C) — sem caminho no app

**Status:** pendente — aberto em 2026-07-16, ao fechar as Etapas 1 e 2 da edição de `colab_email`
**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md))

As três etapas da edição de `colab_email` sensível à identidade **estão feitas** (trava de UI + a EF `corrigir-email-acesso`, que renomeia a conta pendente do estado B). **Sobra o estado C:** quem tem login **confirmado** não consegue trocar o próprio e-mail pelo app — e a coordenação também não, de propósito (dar essa alavanca à coordenação reabriria o sequestro). Hoje a única saída é o dashboard do Auth, na mão.

Faltam as duas pontas: **(1) o caminho principal** — `supabase.auth.updateUser({ email })` no `PerfilColaborador`, com a dupla confirmação nativa e o sync de volta para `colab_email` quando confirmar; **(2) a exceção administrativa** — o dono que perdeu a caixa antiga, que exigiria ação separada, restrita a `admin`, auditada. Detalhe e o porquê de cada uma ter ficado de fora em [`analises/dividas-auth-colaborador.md`](./analises/dividas-auth-colaborador.md) §1-bis.

**Resíduo relacionado (§1):** a trava de `colab_email` é **de UI, não de banco** — a RPC `update_meu_colaborador` ainda aceita `p_email` e a policy de UPDATE ainda alcança a coluna, então uma chamada direta ao PostgREST re-ancora a linha. Fechar isso pede trigger (que dispara mesmo para `service_role`, então precisaria de escape para a `corrigir-email-acesso`) ou tirar a coluna do alcance da policy.

---

## Sanear as chaves PIX e preencher `tipo_chave_pix`

**Status:** pendente — aberto em 2026-07-14, quando as colunas ganharam unicidade
**Área:** Colaboradores (ver [`estrutura/modulos/aplicacao-provas/colaboradores.md`](./estrutura/modulos/aplicacao-provas/colaboradores.md))

Duas pontas soltas deixadas de propósito pela migration `20260714163506_*`:

1. **Os formatos da chave PIX estão misturados.** Das 565 chaves preenchidas, 94 estão em formatos mistos (`127.139.687-47` ao lado de `12713968747`, `(24)998491988`, chaves com espaço no meio) e **uma tem 21 dígitos** — não é chave válida de tipo nenhum. O índice único atual normaliza caixa e espaço nas pontas, mas **não** pontuação: a mesma chave escrita de dois jeitos ainda entra duas vezes. Sanear isso é reescrever dado bancário de 565 pessoas e pede conferência humana.

2. **`tipo_chave_pix` está `NULL` nas 771 linhas.** O tipo **não é inferível** do valor: 397 chaves têm 11 dígitos, e 11 dígitos é tanto CPF quanto celular com DDD (193 batem com o CPF da própria pessoa, 188 com o telefone dela, e o resto com nenhum dos dois). Adivinhar errado é errar o destino de um pagamento. Preencher exige ou confirmação humana, ou uma regra de negócio que ainda não existe.

Enquanto (2) não estiver resolvido, não é possível criar o `CHECK` que amarra "tem chave ⇒ tem tipo".

**Atenção:** qualquer correção em massa aqui é **operação de dados** e esbarra na regra do seed — migration não alcança dado que entra pelo dump (ver [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md)).

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

## ✅ O `.env` da raiz se chamava produção e apontava para o Docker local — FECHADO em 2026-09-12

**Status:** ✅ **resolvido.** O `.env` foi **removido** (o `.env.local` já cobria o desenvolvimento e vence a precedência, então ele só existia para enganar), e os três arquivos passaram a ser documentados no **`.env.example`** — o único `.env*` versionado da raiz, sem segredo nenhum.

> 🔵 **Medido depois de remover:** `npm run build` sai com **0** ocorrências de `127.0.0.1` e 7 do projeto de produção; `vite build --mode development` sai com 4 e **0**. Cada modo aponta para onde deve.
>
> 🔴 **ACHADO NÃO PREVISTO, e mais grave que o item:** o `.env.local` guardava quatro variáveis `SMTP_*` com a **senha real do e-mail da FEVRE**, em texto claro. **Ninguém as lia** — o Vite só embute o prefixo `VITE_` (conferido: 0 ocorrências no bundle) e as Edge Functions leem `supabase/functions/.env`. Era credencial viva guardada onde não servia. As quatro linhas saíram.
>
> ⏭️ **PENDENTE, e é do usuário:** a senha ficou exposta no histórico da sessão em que foi achada (2026-09-12) — **rotacionar na Hostinger** e, depois, atualizar o secret no dashboard do Supabase e o `supabase/functions/.env` local. O envio se confirma com uma recuperação de senha real, como em 09/09.
>
> ⚠️ **O texto abaixo descrevia a situação até 12/09** e fica pelo que a armadilha ensina. A proposta que ele registrava — *"renomear para `.env.local`, que é o que ele de fato é"* — **não era executável**: `.env.local` já existia, e os dois apontavam para o Docker. Pior, o cabeçalho do `.env.local` afirmava que apagá-lo "volta a usar o `.env` de produção", o que era falso nos dois sentidos.

**Status original:** ⏳ absorvido pelo item acima (etapa 1 do roadmap de alternância)
**Área:** Infraestrutura / build (ver [`hospedagem-e-deploy.md`](./hospedagem-e-deploy.md))

O arquivo `.env` da raiz contém `VITE_SUPABASE_URL="http://127.0.0.1:54321"` com a publishable key **local** — e se apresenta como o arquivo de produção. É a **armadilha nº 1 do §8 do CLAUDE.md**: o nome mente antes do código.

🔵 **Ficou menos perigoso em 2026-08-08**, quando `.env.production` passou a existir. Conferido na fonte do Vite (`getEnvFilesForMode`): a ordem é `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`, então **`.env.production` vence** e o `npm run build` sai apontando para a nuvem. Comprovado no artefato: 0 ocorrências da URL local no bundle.

🔴 **Mas o risco não é o build de hoje — é o dia em que `.env.production` sumir ou for esquecido.** O `.env` continua ali, com cara de produção, pronto para gerar um bundle que aponta para o Docker local **sem erro nenhum no build**. O sintoma aparece só em runtime: a página carrega, o login aparece, e tudo falha.

🔵 **Corrigido em 2026-09-09: esta linha dizia que o sintoma é *"idêntico ao de projeto pausado por inatividade, o que torna o diagnóstico confuso"*. NÃO é idêntico, e a diferença é fácil de ver.** A pausa foi medida em 08/09: o hostname do projeto **some do DNS** (NXDOMAIN autoritativo), então o navegador nem chega a fazer requisição. Bundle apontado para o Supabase errado é o oposto — o nome **resolve** normalmente e a falha vem depois, na requisição. **Um `dig +short <ref>.supabase.co` separa os dois em segundos.** Ver `banco-producao.md`.

**Saídas possíveis** (nenhuma decidida): renomear para `.env.local`, que é o que ele de fato é; ou deixar um comentário no topo dizendo em voz alta que ele é local e que `.env.production` é quem vale.

🔵 Foi o **achado A2** do roadmap de bootstrap, o único item dele que não fechou junto — ver [`analises/concluidos/roadmap-bootstrap-banco-producao.yaml`](./analises/concluidos/roadmap-bootstrap-banco-producao.yaml), seção `fechamento`, P3.

---

## ✅ Migrar hospedagem/deploy para fora do Lovable — EXECUTADO em 2026-08-13

**Status:** ✅ **o site está no ar**; sobraram duas conferências (abaixo)
**Área:** Infraestrutura (ver [`estrutura/transversais/arquitetura-geral.md`](./estrutura/transversais/arquitetura-geral.md))

🔵 **Medido em 2026-08-13, não presumido:** `https://fevre.online` responde **200** por nginx sobre HTTP/2 com TLS válido, servindo o build, e **o bundle publicado aponta para `https://zugigdpuxbpogoepdawm.supabase.co`** com a publishable key de `.env.production`. Site de produção falando com o banco de produção — a armadilha do `.env` da raiz não mordeu.

O deploy foi executado **em outra sessão**, e o ferramental vive fora deste repo (`configura_server_gestaoconcurso`), então este item não guarda o registro do que foi feito lá.

*(O texto abaixo é o do item enquanto ele estava aberto, preservado porque explica as decisões — PaaS descartado, túnel SSH descartado. Ele dizia: "o projeto está temporariamente fora do ar… não há mais deploy ativo em lugar nenhum".)*

🔵 **O COMO deixou de ser pergunta em 2026-08-08.** O roteiro está em [`hospedagem-e-deploy.md`](./hospedagem-e-deploy.md): **servidor Ubuntu 24.04 próprio**, nginx servindo o build estático, público em `fevre.online` com TLS do Let's Encrypt. ⚠️ Este item dizia "ex.: Vercel, Netlify" — **PaaS foi descartado**, assim como o acesso só por túnel SSH (inviável: cada fiscal precisaria de chave SSH no servidor para abrir a tela de login).

O ferramental existe e foi testado, **fora deste repositório**, em `configura_server_gestaoconcurso` — quatro scripts (hardening, nginx, TLS, deploy) mais dois templates de nginx. Este repo não versiona infraestrutura, por decisão.

**Falta executar:** provisionar o servidor, apontar o DNS de `fevre.online` para ele, e rodar as quatro etapas.

🔵 **A dependência do banco CAIU em 2026-08-10** e a publicação aconteceu em **13/08**. O `deploy.sh` **recusa publicar** um build que aponte para o Docker local, e o gate passou — o bundle no ar prova isso.

### ⚠️ O que sobrou deste item (é o que fazer, o resto é histórico)

1. 🔴 **Conferir o secret `SITE_URL` das Edge Functions e as redirect URLs do dashboard.** Este era o motivo real da proibição de disparar e-mail, e **ele não caiu junto com o site**: `_shared/enviar-link-acesso.ts` faz `Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:8080'`, então **sem o secret todo convite e toda recuperação de senha nascem apontando para `localhost`** — a função responde sucesso, o e-mail chega, e só o destinatário descobre. Ver o passo 7 de [`banco-producao.md`](./banco-producao.md).
2. ⚠️ **Rodar `prod:push:dry`**: produção pode ter acumulado atraso de migrations novas de `dev` desde 08/08, e esse delta é parte da próxima release (era o risco R4 do roadmap de bootstrap).

✅ **`public/auth_users_export.csv` foi removido** — `public/` inteiro vira URL pública e ele tinha uma linha de dado real (UUID de conta, e-mail, nome, último login). A remoção está na árvore, **ainda não commitada**.

---

## Pendências menores da importação de candidatos

**Status:** registradas para adiante — nenhuma bloqueia nada hoje
**Área:** Candidatos

1. ~~**O fixture `CABECALHO_REAL` está defasado**~~ — ✅ **RESOLVIDO em 2026-07-31.** Atualizado lendo o arquivo real (`docs/temp/todos inscritos concurso 002-2026-SMA cabeçalho.xls`), não de memória: a coluna 0 se chama `N_INSCRICAO`, são 29 colunas, 7.416 linhas de dado, e a `LINHA_REAL` do fixture bate **exatamente** com a primeira linha — ela não precisou mudar. O caso "coluna sem título" ganhou fixture próprio (`CABECALHO_SEM_TITULO_NA_COLUNA_A`) mais um **controle negativo** que quebra se alguém reverter o cabeçalho — sem ele o fixture envelheceria calado de novo, que é o que houve entre 27/07 e 31/07.

   🔴 **O item dizia "3 asserções" e eram QUATRO** — e a quarta é a que importa: `converterLinha` afirmava `n_inscricao: "214274"`, que é o `ID` da coluna B, **o identificador da PESSOA**. O teste ficava verde porque o fixture defasado mapeava `n_inscricao` para a coluna 1; ele afirmava como correto exatamente o defeito que a correção de 28/07 identificou. **Armadilha 8 de `testes.md` outra vez** — teste verde guardando defeito — e a **quarta** vez que um item deste backlog erra a contagem ou a premissa.

2. ~~**Alargar o trigger da 5b**~~ — ❌ **SEM OBJETO desde 2026-08-01.** O item dizia *"fica sem sentido se a chave mudar, então decidir a chave ANTES"*. A chave **mudou** (migration `20260801193530`: agora é `(edital_id, n_inscricao)`), e o trigger em questão — `candidatos_recusa_reapontar_cargo`, o `RC001` — **já não existia**: foi dropado em 30/07 pela `20260730140000`, quando a troca total o tornou incapaz de disparar. O item sobreviveu a essa remoção por dois dias falando de um trigger que o banco não tem.

   ⚠️ **É a quinta vez que um item deste backlog carrega premissa errada** — aqui, um alvo que já tinha sido removido. Conferir a premissa no código antes de executar continua sendo obrigatório.

3. ~~**`anon` continua com `TRUNCATE` em `candidatos`**~~ — ✅ **RESOLVIDO em 2026-07-31** pela migration `20260731110000`: `anon` perdeu **todos** os privilégios em `public`, e o `ALTER DEFAULT PRIVILEGES` parou de reconceder. Ver ["os grants de `anon` foram a zero"](./analises/concluidos/backlog-itens-concluidos.md) no histórico — a execução do item achou, de quebra, um vazamento de leitura em 8 policies.

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

## 🔴 O seletor de fiscal de sala está VAZIO — 456 pessoas alocadas, nenhuma atribuível

**Status:** medido em 2026-08-03, ao ler `/gerenciar-salas-distribuidas`. **Não corrigido por decisão do usuário no mesmo dia** — anotado aqui, sem prazo.
**Área:** Aplicação de Provas

Os dois seletores "Fiscal 1" e "Fiscal 2" de `/gerenciar-salas-distribuidas/:provaId/:unidadeId` oferecem **apenas "Nenhum"**, em todas as provas do banco. Não é falta de gente: é o critério que escolhe quem aparece.

`useFiscaisSala` (em `src/hooks/useSalasDistribuidas.tsx`) decide quem é fiscal **por substring do nome da função**, no JS:

```ts
funcao.includes("fiscal") && funcao.includes("sala")
```

**MEDIDO no banco local recém-resetado (03/08) — as alocações por função:**

| função cadastrada | alocações | entra no seletor? |
|---|---|---|
| **Fiscal** | **456** | ❌ |
| Equipe de Apoio | 28 | ❌ |
| Auxiliar de Coordenação | 14 | ❌ |
| Ledor/ Marcador | 13 | ❌ |
| Coordenador Geral | 10 | ❌ |
| outras 10 funções | 21 | ❌ |
| **total** | **554** | **0 entram** |

A única função de fiscal cadastrada chama-se **"Fiscal"**, sem "de sala" — e nenhuma das 15 casa com a exigência das **duas** palavras. Consequência conferida no dado: **0 fiscais atribuídos** nas 58 salas distribuídas.

🔴 **Não é bug novo: é um risco que a doc já previa, acontecido.** [`estrutura/modulos/aplicacao-provas/00-modulo.md`](./estrutura/modulos/aplicacao-provas/00-modulo.md) (ponto frágil 1) e [`alocacao-e-funcoes.md`](./estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md) já avisavam que *"renomear a função no cadastro esvazia aquela lista sem erro nenhum"*. É o padrão **"o NOME mente"** do §8 do CLAUDE.md — não existe id nem flag marcando "esta função é fiscal de sala"; existe um palpite sobre o texto.

**As duas saídas, e por que elas não são equivalentes:**

- **Afrouxar a heurística** (exigir só `includes("fiscal")`) devolve a lista hoje e custa uma linha — mas mantém a adivinhação de pé, e passa a incluir qualquer coisa que tenha "fiscal" no nome ("Fiscal de Corredor", se existir).
- **Marcar a função explicitamente** no cadastro de `funcoes_colaboradores` (flag/coluna) tira a decisão do texto. É a correção que fecha o padrão, e é maior: mexe no CRUD de funções, na migration e no ponto frágil que a doc descreve.

⚠️ **Medir antes de escolher:** conferir se alguma prova real já teve fiscal atribuído (hoje são **0** — então não há histórico a preservar) e se o cadastro de funções deve distinguir "fiscal de sala" de outros fiscais. É essa resposta que decide entre as duas saídas.

**Achado irmão, do mesmo dia e da mesma tela — menor, mas do mesmo tipo:** a deduplicação de fiscal só olha as salas da **unidade aberta** (`isFiscalAvailable` varre `editableSalas`), enquanto a lista de candidatos vem da **prova inteira**. Duas unidades abertas em sequência aceitam a mesma pessoa como fiscal nas duas, e o banco não impede — o comentário de `avisoFiscalDeSala` já assume isso ao usar plural. Enquanto o seletor estiver vazio, é inalcançável; quando ele voltar, volta junto.

⚠️ **Se este item for fechado, os avisos de `00-modulo.md` e `alocacao-e-funcoes.md` saem no mesmo passe** — aviso envelhecido é pior que aviso nenhum.

---

## Temas de infraestrutura — futuro distante

**Status:** anotados, sem desenho e sem ordem definida. Nenhum tem dono nem medição ainda.

- ~~Rate Limiting~~ → **saiu daqui em 2026-08-13** (roadmap próprio em [`analises/roadmap-rate-limit-fluxos-de-acesso.yaml`](./analises/roadmap-rate-limit-fluxos-de-acesso.yaml); o porquê em [`analises/analise-rate-limit-login.md`](./analises/analise-rate-limit-login.md)). ✅ **Etapas 1 e 2 EXECUTADAS em 2026-09-12:** a RPC `registrar_tentativa` (atômica, falhando fechado, com retenção e IPv6 normalizado para /64) substituiu o teto que falhava aberto, e as **duas portas públicas que não tinham teto nenhum** passaram a ter — `public-create-colaborador` (3/60min) e `check-cpf-colaborador` (30/15min). ⏭️ **Continuam abertas** as etapas 3 (`minimum_password_length` > 6, que é config de dashboard), 4 (cooldown por ALVO na `reivindicar-acesso`) e 5 (contar os 429). ⚠️ Os tetos são **ordem de grandeza, não número medido** — ninguém passou por esses fluxos ainda.
- Caching & CDN
- Load Balancing & Scaling
- Error Tracking & Logs
- Availability & Recovery

---

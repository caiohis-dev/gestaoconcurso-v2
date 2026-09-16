# Plano da v3 — Módulo Editais · ÍNDICE

> **Este arquivo guarda o que vale para TODAS as fatias:** o porquê, as decisões
> transversais e o índice. **O plano de execução de cada fatia é um roadmap YAML** em
> [`../analises/`](../analises/), no padrão do repositório.
>
> Os demais arquivos desta pasta são o **material de referência** que originou o plano;
> vários pontos deles foram corrigidos em 2026-09-16, e cada correção está anotada inline
> no arquivo afetado.
>
> **Estado: PLANEJADO, nada implementado.**

---

## 1. Por que este módulo cresce

Hoje o módulo Editais é uma tabela de 5 campos (`nome`, duas linhas de cabeçalho, `n_candidatos` órfã), uma página de cards e um dialog. O contrato atual ([`../estrutura/modulos/editais/00-modulo.md`](../estrutura/modulos/editais/00-modulo.md)) afirma que *"o edital é um MODELO, não uma fonte de verdade operacional"* — ele só sugere o cabeçalho de uma prova nova.

Na v3 o edital passa a ser **o documento normativo do certame**, autorado dentro do sistema.

**O motivo é concreto, e está no [`Peculiaridades_Editais_FEVRE.md`](./Peculiaridades_Editais_FEVRE.md):** dois defeitos reais no Edital 004/2026, **já publicado**.

| Defeito | Onde | Qual fatia o mata |
|---|---|---|
| **Copia-e-cola** — exige "Certidão Nada Consta do COREN" na posse de Agente Comunitário de Saúde, cargo sem conselho de classe | item 15.8-L | **fatia 8** (investidura), com a base na fatia 2 |
| **Placeholder esquecido** — `"dia XX/xx/2026"` no corpo publicado | itens 12.4 e 14.9 | **fatia 3** (cronograma), com o linter da fatia 1 |

O sistema inteiro é desenhado para tornar essas duas classes de erro **impossíveis**, não improváveis.

---

## 2. As cinco decisões que governam todo o módulo

Tomadas com o usuário em 2026-09-16. Cada roadmap repete só as que o afetam; a lista completa é esta.

| # | Decisão | Consequência |
|---|---|---|
| **D1** | **Documento primeiro, dado junto** | O alvo é o edital publicável; a estrutura de dados nasce dele, já pensada para Candidatos e Aplicação de Provas consumirem depois |
| **D2** | **`cargos` existente é a fonte de verdade** | O catálogo do módulo Candidatos **não se duplica**. Incrementa-se quando preciso, respeitando a CG001 e a bateria da importação |
| **D3** | **LLM não entra agora** | Texto por template determinístico; linter por regra. ⚠️ O linter que acha `XX/xx` e conselho indevido **não** precisa de modelo — o que está adiado é redigir o texto jurídico |
| **D4** | **Os três editais são só referência** | 002, 003 e 004 **não** serão importados. São extração de PDF sem estrutura — parsing confiável ali seria um módulo à parte |
| **D5** | **Primeira fatia: a espinha do documento** | Antes de qualquer capítulo com conteúdo, o mecanismo que monta e numera |

---

## 3. 🔴 A premissa que o material de referência quase impôs, e que é FALSA

O [`Peculiaridades_Editais_FEVRE.md`](./Peculiaridades_Editais_FEVRE.md) tinha uma seção *"Diretrizes para a LLM"* cujo item 1 dizia:

> *Se Magistério → injetar Prova de Títulos. Se Saúde → injetar Legislação do SUS e plantão 12x36. Se Agentes → injetar territorialidade e Matemática.*

Lido literalmente, isso vira um **mapa carreira → funcionalidades cravado no código**.

**O usuário desmentiu a premissa em 2026-09-16:**

> *"As peculiaridades deles podem variar em futuros editais. O edital que hoje é ACS pode ter características que só estão no edital dos enfermeiros. E vice-versa."*

**Portanto: toda peculiaridade é ORTOGONAL.** Parâmetro independente, ligável em qualquer edital, em qualquer combinação. A carreira pode no máximo **sugerir um preset** na criação — nunca determinar, nunca impedir, nunca esconder.

### A consequência que define a fatia 1

Se todo capítulo pode entrar ou sair, **a numeração é sempre calculada, nunca escrita.** Medido no material real:

| | |
|---|---|
| `Estrutura de Edital.md` numera PCD como | capítulo **[8]** |
| No Edital 002/2026 publicado, PCD é | capítulo **7** |
| O modelo abstrato tem | 18 capítulos |
| O Edital 002 publicado tem | **16** + Anexo I |

E o 002 já carrega o resíduo do erro que isso produz: uma linha solta **`"10. e seus subitens"`** dentro do capítulo 7 — referência cruzada que envelheceu quando a numeração mudou.

---

## 4. As 12 fatias

Cada uma tem roadmap próprio em [`../analises/`](../analises/), no padrão YAML do repositório. **A ordem é proposta, não decidida** — a única dependência dura é que **tudo se pendura na fatia 1**.

| # | Fatia | Roadmap |
|---|---|---|
| 1 | Espinha do documento | [`roadmap-editais-espinha-do-documento.yaml`](../analises/roadmap-editais-espinha-do-documento.yaml) |
| 2 | Cargos, vagas e remuneração | [`roadmap-editais-cargos-vagas-remuneracao.yaml`](../analises/roadmap-editais-cargos-vagas-remuneracao.yaml) |
| 3 | Cronograma e prazos | [`roadmap-editais-cronograma-e-prazos.yaml`](../analises/roadmap-editais-cronograma-e-prazos.yaml) |
| 4 | Ações afirmativas e condições especiais | [`roadmap-editais-acoes-afirmativas.yaml`](../analises/roadmap-editais-acoes-afirmativas.yaml) |
| 5 | Matriz da prova objetiva | [`roadmap-editais-prova-objetiva.yaml`](../analises/roadmap-editais-prova-objetiva.yaml) |
| 6 | Prova de títulos | [`roadmap-editais-prova-de-titulos.yaml`](../analises/roadmap-editais-prova-de-titulos.yaml) |
| 7 | Territorialidade e lotação | [`roadmap-editais-territorialidade-e-lotacao.yaml`](../analises/roadmap-editais-territorialidade-e-lotacao.yaml) |
| 8 | Investidura e posse | [`roadmap-editais-investidura.yaml`](../analises/roadmap-editais-investidura.yaml) |
| 9 | Inscrição, taxas, isenção e canais | [`roadmap-editais-inscricao-taxas-isencao.yaml`](../analises/roadmap-editais-inscricao-taxas-isencao.yaml) |
| 10 | Conteúdo programático (Anexo I) | [`roadmap-editais-conteudo-programatico.yaml`](../analises/roadmap-editais-conteudo-programatico.yaml) |
| 11 | Critérios de desempate e resultado | [`roadmap-editais-desempate-e-resultado.yaml`](../analises/roadmap-editais-desempate-e-resultado.yaml) |
| 12 | Exportação (PDF / Markdown / JSON) | [`roadmap-editais-exportacao.yaml`](../analises/roadmap-editais-exportacao.yaml) |

🔵 **As fatias 9, 10 e 11 nasceram depois**, em 2026-09-16: ao dividir o plano apareceu que três módulos do [`Arquitetura de Tabelas…`](./Arquitetura%20de%20Tabelas%20de%20Banco%20de%20Dados%20para%20Editais.md) não tinham fatia, e o `edital_canais_atendimento` não tinha dono. A exportação, que era a 9, virou a 12.

### As dependências que não são a ordem da lista

- **Fatia 8 depende da 2** — a injeção de conselho de classe precisa de `cargos.conselho_classe_obrigatorio`.
- **Fatias 10 e 11 dependem da 5** — as duas referenciam disciplina da prova.
- **Fatias 4, 6 e 9 dependem da 3** — os prazos saem do cronograma.

### As três perguntas abertas que travam código

| Fatia | Pergunta |
|---|---|
| 2 | Qual é a **regra de arredondamento legal** das cotas (10% PCD, 20% negros)? É norma, não escolha de implementação |
| 3 | De onde vem a lista de **feriados municipais** de Volta Redonda, sem a qual "1 dia útil" é chute? |
| 7 | **`unidades_lotacao` vs. `unidades_prova`** — reaproveitar, relacionar ou separar? |

---

## 5. Fora de escopo do módulo inteiro (por ora)

- Importar os editais 002/003/004 para dentro do sistema (**D4**).
- Qualquer chamada a LLM (**D3**).
- O "diff comparativo com edital anterior" do `UI e UX.md` §3.
- A dívida do `provas.prova_edital` (`CHAR(30)`) e a coluna órfã `editais.n_candidatos` — dívidas conhecidas do módulo atual, documentadas no contrato, que não se resolvem aqui.

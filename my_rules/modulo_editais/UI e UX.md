> 🔵 **Anotado em 2026-09-16 — leia [`00-Plano-v3.md`](./00-Plano-v3.md) antes deste arquivo.**
>
> A visão geral deste documento foi **aceita**: 3 painéis, preview ao vivo, linter e mecanismos anti-erro. Quatro pontos foram corrigidos e estão anotados inline:
>
> 1. **A coluna esquerda não é um stepper de passos fixos** — é projeção da lista de capítulos (§1).
> 2. **"Condicional: ACS" e "Condicional: Magistério" estão errados** — nenhuma funcionalidade é presa a carreira (Passos 4 e 7).
> 3. **Nenhum recurso de LLM entra agora** (decisão D3) — inclusive o "Sanitizar Texto", que é regra (§3).
> 4. **A numeração dos capítulos é calculada, nunca escrita** — é o que a fatia 1 entrega.

Uma interface para elaboração de editais públicos não deve ser um formulário monolítico (como um longo documento do Word), mas sim uma **IDE Jurídico-Administrativa (Edital Studio)**. 

O objetivo da UI/UX é evitar inconsistências legais, cálculos matemáticos errados e o erro clássico do *"copia e cola"* desatento (ex.: exigir registro de enfermagem para ACS).

Abaixo proponho o modelo de interface dividido em **Arquitetura de Tela**, **Fluxo de Parametrização (O Que x Como)** e **Mecanismos de Assistência e Anti-Erro**.

---

# 1. Arquitetura da Interface (Layout Geral de 3 Painéis)

A interface adota o padrão de tela dividida em 3 colunas funcionais:

```
┌─────────────────┬──────────────────────────────────────────┬────────────────────────┐
│   NAVEGAÇÃO     │           WORKSPACE PRINCIPAL            │    LIVE PREVIEW &      │
│  (Etapas/Check) │          (Formulários Dinâmicos)         │   LINTER DE EDITAL     │
├─────────────────┼──────────────────────────────────────────┼────────────────────────┤
│ 1. Metadados    │ Seção: Estrutura da Prova Objetiva       │ [Preview do Documento] │
│ 2. Cargos/Vagas │                                          │                        │
│ 3. Salários/Ben.│ [Total de Questões: 50]                  │ 11. DA PROVA           │
│ 4. Cotas & PCD  │ ┌──────────────────────────────────────┐ │ 11.1 A Prova Objetiva  │
│ 5. Provas [!]   │ │ Disciplina: Língua Portuguesa (10)   │ │ constará de 50 ques- │
│ 6. Títulos      │ │ Disciplina: Conh. Pedagógicos (15)   │ │ tões, assim dividi-  │
│ 7. Cronograma   │ │ Disciplina: Conh. Específicos (25)   │ │ das: [...]           │
│ 8. Investidura  │ └──────────────────────────────────────┘ │                        │
│                 │                                          │ ⚠ ALERTAS (LINTER):    │
│ [Status: 85%]   │ [ + Adicionar Disciplina ]               │ • Soma das questões: OK│
│ [Validar Edital]│ [ Salvar e Continuar → ]                 │ • Nota corte: 50% OK   │
└─────────────────┴──────────────────────────────────────────┴────────────────────────┘
```

* **Coluna Esquerda (Navegador de Capítulos):** Lista os capítulos do edital com ícones de status (`Completo`, `Pendente`, `Com Inconsistência`).

  🔴 **Corrigido em 2026-09-16 — NÃO é um stepper de passos fixos.** O desenho acima mostra "1. Metadados / 2. Cargos / …8. Investidura", numeração cravada. Com capítulos que entram e saem por parâmetro, isso não se sustenta: o número de cada um muda conforme os condicionais, e capítulos desligados não aparecem.

  **A trilha da esquerda, o formulário do centro e o preview da direita são três projeções da MESMA lista de capítulos.** Acrescentar capítulo = uma entrada no catálogo, e nada mais.

  ⚠️ O motivo não é estético, é um defeito que este repo já pagou. `src/pages/CandidatosImportar.tsx:83` avisa, sobre o stepper artesanal dele: *"adicionar um passo precisa tocar TRÊS lugares: a trilha, os blocos `{passo === n}` e as transições. Errar um deixa um passo inalcançável, sem erro nenhum na tela."* Repetir esse padrão aqui compra esse defeito multiplicado por 18.

  💡 O layout de 3 painéis usa `src/components/ui/resizable.tsx`, que já existe no projeto.
* **Coluna Central (Área de Parametrização):** Onde o usuário insere dados por meio de componentes visuais inteligentes (tabelas editáveis, toggles, seletores condicionais).
* **Coluna Direita (Live Preview + Linter):** Renderização em tempo real do texto jurídico formatado e um painel de avisos/alertas de erros legais ou lógicos.

---

# 2. O Que o Usuário Parametriza e Como (Passo a Passo)

---

### Passo 1: Identificação, Órgão e Regime Jurídico
* **O que parametriza:** Tipo de certame, número/ano do edital, secretarias demandantes, regime funcional e banca responsável.
* **Como parametriza:**
  * **Segmented Control / Radio Cards:** 
    * Alterna entre: `[ Concurso Público (Estatutário) ]` e `[ Processo Seletivo (Lei 11.350 / ACS-ACE) ]`.
    * *UX Efeito:* A escolha altera automaticamente o texto legal padrão do preâmbulo e dos artigos da posse (estabilidade em 3 anos vs. contrato de emprego público).
  * **Inputs Padronizados:** Número/Ano com máscara (`NNN/AAAA`), dropdown pesquisável de Secretarias (`SME`, `SMS`, `SMA`) e decretos municipais de contratação da banca.

---

### Passo 2: Catálogo de Cargos, Vagas e Remuneração
* **O que parametriza:** Relação de funções, escolaridade, código do cargo, carga horária, salário-base e conselho de classe vinculado.
* **Como parametriza:**
  * **Data Table Editável (Estilo Planilha):**
    * O usuário pode adicionar linhas ou importar de um catálogo pré-existente no banco de dados.
    * Colunas: `Código` | `Nome do Cargo` | `Nível` | `Vagas AC` | `Vagas PCD` | `Vagas CN` | `Carga Horária` | `Salário Base`.
  * **Cálculo Automático de Cotas (UX Helper):**
    * Ao preencher o número total de vagas, a UI calcula e sugere automaticamente a reserva:
      * $10\%$ para PCD (arredondamento legal).
      * $20\%$ para Negros (Lei 5.309/2017).
    * O usuário pode sobrescrever manualmente, mas recebe alerta se ficar abaixo do mínimo legal.
  * **Modal de Vínculo Profissional (Anti-Erro):**
    * Para cada cargo, abre-se uma gaveta lateral (*Drawer*) para selecionar:
      * *Conselho de Classe:* `Nenhum`, `COREN`, `CREF`, `OAB`, `CRM`.
      * *UX Trava:* Se o cargo for de nível médio comum (ex: ACS), a UI bloqueia a seleção de conselhos como o COREN, impedindo a contaminação cruzada de minutas.

---

### Passo 3: Composição Salarial e Benefícios
* **O que parametriza:** Gratificações, adicionais, auxílios e regimes especiais de escala (12x36).
* **Como parametriza:**
  * **Tag Selectors & Numeric Inputs:**
    * Switches rápidos: `[x] Auxílio Alimentação (R$ 350)` | `[x] Gratificação Social (R$ 200)`.
  * **Matriz de Gratificações:**
    * ⚠️ **Corrigido em 2026-09-16.** O texto original condicionava a EXIBIÇÃO ao tipo de cargo (*"Se Cargo for Docente → exibe Regência de Turma; se for Saúde → exibe Plantão 12x36"*). Isso esconde da pessoa que redige uma opção que ela pode legitimamente querer.
    * **Todas as gratificações ficam disponíveis para todos os cargos.** O tipo de cargo pode **pré-marcar** as usuais (Regência de Turma e Nível Superior em docência; Plantão 12x36 e Insalubridade em saúde) — nunca ocultar nem desabilitar as demais.

---

### Passo 4: Territorialidade e Lotação *(Capítulo condicional)*

⚠️ **Corrigido em 2026-09-16:** o título dizia *"(Condicional: ACS)"*. Territorialidade é parâmetro ortogonal, **ligável em qualquer edital** — inclusive docência ou enfermagem. O ACS é o caso conhecido, não uma condição.
* **O que parametriza:** Distribuição por postos de saúde (UBS/UBSF) e lista de logradouros por microárea.
* **Como parametriza:**
  * **Toggle Mestre:** `[ Ativar Critério de Territorialidade Estrita (Residência Obrigatória) ]`.
  * **Importador em Lote (CSV/Excel):**
    * Upload simples de planilha com as colunas: `Unidade Básica` | `Bairro` | `Rua/Logradouro` | `Trecho/Número`.
  * **Accordion Hierárquico:** Visualização interativa onde o usuário pode expandir a `UBSF Retiro 1` e adicionar ou remover ruas manualmente com autocomplete.

---

### Passo 5: Ações Afirmativas e Condições Especiais
* **O que parametriza:** Validade dos laudos médicos, perícia do município e regras de amamentação (lactantes).
* **Como parametriza:**
  * **Cards de Configuração PCD:**
    * Toggle: `[ Aplicar Leis RJ 9.425/21 e 10.186/23 (Laudo por prazo indeterminado para irreversível/TEA/Down) ]`.
    * Multi-DatePicker: Seleção das datas disponíveis para perícia no *Saúde do Trabalhador* (o sistema gera as opções automaticamente no texto).
  * **Preset de Regra para Lactantes:**
    * Radio: `Opção A (Sem Compensação de tempo - Padrão Edital 002)` vs. `Opção B (Compensação de até 30 minutos com limite de 6 meses de vida - Padrão Edital 003/004)`.
    * *UX Alerta:* Recomenda a `Opção B` por conformidade com jurisprudência recente de proteção à maternidade. ⚠️ **É regra fixa, não LLM** (corrigido em 2026-09-16, decisão D3) — e é **recomendação**, não trava: quem redige pode escolher a Opção A.

---

### Passo 6: Matriz da Prova Objetiva
* **O que parametriza:** Quantidade de questões, disciplinas por cargo, peso, tempo de prova e nota de corte.
* **Como parametriza:**
  * **Visual Question Builder:**
    * Barra de progresso com contador visual dinâmico:
      `[||||||||||||||||||||||||............] 50 / 70 Questões Definidas`.
    * O usuário adiciona disciplinas e preenche:
      * Português: `10` questões (Peso 1.0)
      * Legislação do SUS: `10` questões (Peso 1.0)
      * Específicos: `30` questões (Peso 1.0)
    * *UX Validador:* Impede o avanço se a soma for diferente do total declarado no cabeçalho do exame.
  * **Sliders de Regras de Sala:**
    * Duração total (ex: 3 horas) | Permanência mínima (ex: 1 hora) | Levar caderno (ex: 2 horas).

---

### Passo 7: Prova de Títulos *(Capítulo condicional)*

⚠️ **Corrigido em 2026-09-16:** o título dizia *"(Condicional: Magistério)"*. Prova de títulos é parâmetro ortogonal, **ligável em qualquer edital** — inclusive ACS. A carreira, no máximo, pré-marca o toggle.
* **O que parametriza:** Inclusão da etapa de títulos, categorias avaliadas e teto global.
* **Como parametriza:**
  * **Toggle:** `[ Este certame possui Prova de Títulos? (Classificatória) ]`.
  * **Grid de Titulações:**
    * Adicionar linhas com: `Nível do Título` (Mestrado/Especialização) | `Área Específica` | `Pontos Unitários` | `Quantidade Máxima` | `Subtotal`.
    * Campo fixo: `Teto Global de Pontos` (ex: 12 pontos). O sistema valida se a soma das pontuações máximas é matematicamente compatível com o teto.

---

### Passo 8: Motor de Cronograma e Prazos
* **O que parametriza:** Todas as datas de inscrições, isenção, divulgação de locais, provas, recursos e resultado.
* **Como parametriza:**
  * **Timeline Interativa com Verificação de Precedência:**
    * O usuário define as datas em um calendário sequencial.
    * **Regras de Negócio Automáticas no Frontend:**
      * A data final de isenção *deve ser* anterior ao término das inscrições.
      * O prazo recursal do gabarito é travado com o valor de `1 dia útil` subsequente ao gabarito (reproduzindo o padrão FEVRE).
      * Alerta se houver etapas marcadas para finais de semana que não sejam a aplicação da prova.

---

### Passo 9: Checklist de Documentos para Posse (Investidura)
* **O que parametriza:** Relação documental a ser apresentada na convocação.
* **Como parametriza:**
  * 🎯 **É aqui que o erro do COREN morre** — o item 15.8-L do Edital 004 exigiu "Certidão Nada Consta do COREN" para Agente Comunitário de Saúde. A regra do linter: barrar conselho de classe que nenhum cargo do edital exige.
  * **Checklist Inteligente Reativo:**
    * O sistema pré-marca automaticamente: RG, CPF, PIS/PASEP, Título/Quitação Eleitoral, ASO Apto, Certidões de Nascimento/Casamento e Reservista (para homens).
    * **Injeção Dinâmica por Cargo:**
      * Se há cargo de Enfermeiro na lista $\rightarrow$ Injeta automaticamente `Registro no COREN` e `Certidão Nada Consta`.
      * Se há apenas Docente ou ACS $\rightarrow$ Os documentos do COREN ficam desabilitados ou ocultos, prevenindo a falha detectada no Edital 004.

---

# 3. Recursos de UX Diferenciados — FORA DO ESCOPO ATUAL

> 🔴 **Nada desta seção entra agora (decisão D3, 2026-09-16).** Não há integração com LLM neste projeto — as Edge Functions só mandam e-mail e criam conta. Adotar uma traz decisões novas (onde a chave vive, custo por chamada, o que a tela faz quando a API está fora, como versionar texto que muda a cada geração), e nenhuma delas precisa ser tomada para o módulo funcionar.
>
> ⚠️ **Mas atenção ao item 2 abaixo: ele NÃO precisa de LLM.** Procurar `XX/xx/2026` e placeholder vazio é regra determinística, e é o linter v1 da fatia 1. O que precisaria de modelo é **redigir** o texto jurídico — e isso é que está adiado.

1. **"Diff" Comparativo em Tempo Real:** 
   * Na barra superior, o usuário pode clicar em `Comparar com Edital Anterior` (ex: Selecionar Edital 003/2026 como espelho). O sistema pinta de verde o que foi alterado e de amarelo o que merece atenção legal.
2. **Botão "Sanitizar Texto":**
   * Uma chamada à LLM que lê todas as variáveis parametrizadas e faz um *scan* no texto gerado em busca de marcadores vazios ou placeholders esquecidos (como as datas `XX/xx/2026` encontradas no Edital 004).
3. **Exportação Multi-formato:**
   * Geração simultânea de:
     * `PDF Final Diagramado` (para publicação no Diário Oficial / Jornal Volta Redonda em Destaque).
     * `Markdown / JSON Estruturado` (para alimentar a API do portal de inscrições da banca).

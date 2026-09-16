> 🔴 **Esta é uma PROPOSTA, conferida contra o banco real em 2026-09-16 — leia [`00-Plano-v3.md`](./00-Plano-v3.md) antes de implementar qualquer coisa daqui.**
>
> Três problemas apareceram ao confrontá-la com o schema que existe hoje. Cada um está anotado no ponto exato; o resumo:
>
> | # | O quê | Onde |
> |---|---|---|
> | 1 | **`cargos` JÁ EXISTE** e é de outro módulo — não se cria de novo | seção 2 |
> | 2 | **`unidades_lotacao` se sobrepõe a `unidades_prova`**, que já existe | seção 3 |
> | 3 | **Falta a espinha**: nada registra os capítulos nem a numeração | seção 0, acrescentada |
>
> ⚠️ **Convenções deste repo que a proposta não menciona e que valem para tudo abaixo:** FK é **`RESTRICT`** por padrão (nunca `CASCADE` por omissão); regra que cruza tabelas é **trigger**, não `if` no hook; operação de vários passos é **RPC em transação**; toda tabela nova precisa de RLS e de `REVOKE` explícito de `anon`. Ver `CLAUDE.md` §2 e a migration `20260731110000`.

---

## 0. Módulo da Espinha do Documento *(acrescentado em 2026-09-16 — é a fatia 1)*

A proposta original descreve o **conteúdo** dos capítulos, mas não o **documento**: não há onde registrar quais capítulos um edital tem, em que ordem, nem como se numeram. Sem isso, nada abaixo se monta.

### `edital_capitulos`

A instância de cada capítulo dentro de um edital.

    Campos principais: id, edital_id (FK RESTRICT), chave (slug estável, ex. "disposicoes_preliminares"), ordem (posição no esqueleto canônico), incluido (boolean). UNIQUE (edital_id, chave).

🔴 **`numero` NÃO é coluna, e isso é o ponto central do módulo.** O número sai calculado dos capítulos incluídos, na renderização. Persistir o número é o defeito que produziu a referência cruzada quebrada do Edital 002 — a linha solta `"10. e seus subitens"` dentro do capítulo 7. Ver [`Estrutura de Edital.md`](./Estrutura%20de%20Edital.md).

**O catálogo dos 18 capítulos vive em CÓDIGO**, não no banco (`src/lib/edital-capitulos.ts`): é versionado, revisável em diff e testável como dado puro. O banco guarda só o que varia **por edital**.

### `editais` — a tabela que JÁ EXISTE, e ganha os metadados

⚠️ **`editais` não é tabela nova.** Existe desde 2026-07-24 com `nome`, `cabecalho_linha1`, `cabecalho_linha2`, `n_candidatos` (órfã) e um **índice funcional** `editais_nome_key` sobre `lower(btrim(nome))` — que **não se troca por um `UNIQUE (nome)` comum**, sob pena de voltarem a conviver `Edital 001` e `edital 001 `. Os campos da seção 1 abaixo são **colunas a acrescentar**, todas **anuláveis**: há 3 editais em produção sem esses dados, e um `NOT NULL` quebraria o `db reset`.

---

┌─────────────┐
                                  │   EDITAIS   │
                                  └──────┬──────┘
         ┌──────────────────┬────────────┼────────────┬──────────────────┐
         ▼                  ▼            ▼            ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌───────┐ ┌──────────────┐ ┌──────────────┐
│  REGRAS GERAIS  │ │  CRONOGRAMA  │ │CARGOS │ │   POLÍTICAS  │ │    ETAPAS    │
│  E METADADOS    │ │   E DATAS    │ │VAGAS  │ │  AFIRMATIVAS │ │  AVALIATIVAS │
└─────────────────┘ └──────────────┘ └───────┘ └──────────────┘ └──────────────┘

1. Módulo Central e Metadados do Certame
editais

Armazena a instância principal de cada concurso ou processo seletivo.

    Campos principais: id, numero_edital (ex: "002/2026"), ano, orgao_demandante (ex: "Secretaria Municipal de Educação"), entidade_executora (ex: "FEVRE"), decreto_autorizador, natureza_juridica (CONCURSO_PUBLICO | PROCESSO_SELETIVO), regime_trabalho (ESTATUTARIO | CLT), prazo_validade_anos (ex: 2), prorrogavel (boolean), texto_preambulo.

edital_canais_atendimento

Pontos focais físicos e eletrônicos para entrega de documentos, recursos e impugnações.

    Campos principais: id, edital_id, tipo_canal (PORTAL_WEB, EMAIL_IMPUGNACAO, EMAIL_VISTA_PROVA, POSTO_PRESENCIAL), descricao_endereco (ex: "Sede Administrativa FEVRE, 4º andar"), horario_funcionamento.

2. Módulo de Cargos, Vagas e Remuneração
cargos

🔴 **ATENÇÃO — `cargos` JÁ EXISTE, e é do módulo Candidatos (decisão D2 de 2026-09-16).**

A tabela real hoje: `id`, `nome`, `nome_chave` (coluna GERADA, `lower(btrim(nome))`, com UNIQUE), `ativo`, `created_at/by`. Ela tem `cargo_apelidos` pendurada, é a chave da importação de inscritos, tem bateria SQL própria e uma regra já estreitada uma vez (**CG001**: só inscrito tranca o cargo, apelido não).

**Não criar uma segunda tabela `cargos`.** A existente é a fonte de verdade; os campos abaixo entram como **colunas novas nela**, anuláveis, sem tocar em `nome_chave` nem na CG001. Antes de mexer, rodar a bateria da importação e vê-la **verde** — é a linha de base que diz, depois, se quem quebrou foi esta mudança.

    Campos a ACRESCENTAR: codigo_oficial, escolaridade_minima (MEDIO, SUPERIOR, TECNICO), conselho_classe_obrigatorio (ex: "COREN", "CREF", "NENHUM" — campo crucial para evitar o erro do Edital 004).

⚠️ A proposta original falava em `titulo_cargo` (ex.: "Docente I – Matemática"); isso é o `nome` que já existe. Não duplicar.

edital_cargos

Parametrização específica do cargo dentro de uma edição de edital.

    Campos principais: id, edital_id, cargo_id, codigo_inscricao (ex: "MT 22"), carga_horaria_valor (ex: 18, 27, 40, 220), carga_horaria_unidade (HORAS_AULA_SEMANAIS, HORAS_SEMANAIS, HORAS_MENSAIS), regime_plantao_permitido (boolean - 12x36), vencimento_base.

cargos_atribuicoes

Detalhamento das atribuições funcionais descritas no edital.

    Campos principais: id, cargo_id, descricao_sintetica, atribuicoes_detalhadas (texto/JSON com lista de itens).

cargos_beneficios

Composição da remuneração total (gratificações, adicionais e auxílios).

    Campos principais: id, edital_cargo_id, tipo_beneficio (AUXILIO_ALIMENTACAO, GRATIFICACAO_SOCIAL, REGENCIA_CLASSE, NIVEL_SUPERIOR, FUNDEB, INSALUBRIDADE), forma_calculo (VALOR_FIXO, PERCENTUAL), valor (ex: 350.00 ou 30.00 para 30%).

3. Módulo Territorial e Adscrição de Vagas

⚠️ **Corrigido em 2026-09-16:** o título dizia *"(Exclusivo ACS/Polos)"*. Não é exclusivo de ninguém — territorialidade é parâmetro ortogonal, ligável em qualquer edital (ver [`Peculiaridades_Editais_FEVRE.md`](./Peculiaridades_Editais_FEVRE.md)). O ACS é o caso conhecido, não o único possível.

unidades_lotacao

🔴 **Conferir contra `unidades_prova`, que já existe.** Ela é o catálogo de locais de **aplicação de prova** (com `sala_prova` pendurada), enquanto `unidades_lotacao` seria local de **trabalho** (UBS/UBSF). São conceitos diferentes que podem apontar para os mesmos prédios. Decidir conscientemente entre reaproveitar, relacionar ou separar — e **registrar o porquê**; o que não pode é nascerem dois catálogos de unidade sem ninguém notar. Decisão adiada para a fatia 7.

Postos de trabalho físicos vinculados às vagas (UBS, UBSF, Escolas ou Regiões).

    Campos principais: id, nome_unidade (ex: "UBSF Água Limpa I"), distrito_sanitario, tipo_unidade.

vagas_distribuicao

Distribuição quantitativa das vagas por cargo e local de lotação.

    Campos principais: id, edital_cargo_id, unidade_lotacao_id (opcional/nullable), vagas_ampla_concorrencia, vagas_pcd, vagas_negros, cadastro_reserva (boolean).

territorialidade_abrangencia

Mapeamento de ruas, servidões e microáreas para cargos com critério de domicílio fixo (Anexo I do Edital 004).

    Campos principais: id, unidade_lotacao_id, tipo_logradouro (RUA, AVENIDA, SERVIDAO), nome_logradouro, numero_inicial, numero_final, bairro.

4. Módulo de Inscrições, Taxas e Isenção
taxas_inscricao

Valores de inscrição definidos por edital e categoria de cargo.

    Campos principais: id, edital_id, nivel_escolaridade ou edital_cargo_id, valor_taxa (ex: 80.00, 100.00).

regras_isencao

Parâmetros de concessão de gratuidade amparados em lei.

    Campos principais: id, edital_id, tipo_criterio (CADUNICO, DOADOR_SANGUE, DOADOR_MEDULA_REDOME, SERVICO_ELEITORAL), lei_referencia (ex: "Lei Municipal nº 5.989/2022"), meses_atualizacao_cadunico (ex: 24), ano_vigente_redome (boolean), minimo_doacoes_sangue_12m (ex: 3), permite_multiplos_cargos_mesmo_envelope (boolean).

5. Módulo de Ações Afirmativas e Condições Especiais
regras_pcd

Parâmetros legais e periciais para reserva de PCD.

    Campos principais: id, edital_id, percentual_reserva (ex: 10.00), leis_municipais_base, aceita_laudo_indeterminado_permanente (boolean — flag identificada no Edital 004), validade_meses_laudo_temporario (ex: 6), obriga_rubrica_todas_folhas (boolean), local_pericia_presencial, datas_pericia_disponiveis (JSON/Array de datas).

regras_cotas_negros

Parâmetros para a reserva racial.

    Campos principais: id, edital_id, percentual_reserva (ex: 20.00), lei_municipal_base (ex: "Lei 5.309/2017"), exige_autodeclaracao_datada_assinada (boolean).

regras_lactantes

Parâmetros específicos para candidatas em período de amamentação.

    Campos principais: id, edital_id, idade_maxima_lactente_meses (ex: 6), data_limite_nascimento_lactente (ex: 2026-03-16), permite_compensacao_tempo (boolean — chave para diferenciar Edital 002 de 003/004), tempo_maximo_compensacao_minutos (ex: 30), intervalos_permitidos (ex: 1).

6. Módulo de Provas e Etapas Avaliativas
fases_concurso

Macroetapas que compõem o certame por edital e cargo.

    Campos principais: id, edital_cargo_id, tipo_fase (PROVA_OBJETIVA, PROVA_TITULOS, TESTE_APTIDAO_FISICA), ordem_fase, carater (ELIMINATORIO_E_CLASSIFICATORIO, APENAS_CLASSIFICATORIO).

provas_objetivas_config

Configurações de aplicação do exame escrito.

    Campos principais: id, edital_cargo_id, total_questoes (ex: 50, 70), duracao_minutos (ex: 180), tempo_minimo_permanencia_minutos (ex: 60), tempo_minimo_levar_caderno_minutos (ex: 120), nota_corte_percentual (ex: 50.00), permite_zerar_disciplina (boolean - false).

provas_disciplinas

Divisão das disciplinas na prova de cada cargo.

    Campos principais: id, prova_objetiva_config_id, nome_disciplina (ex: "Língua Portuguesa", "Matemática", "Conhecimentos Pedagógicos", "Legislação do SUS", "Conhecimentos Específicos"), quantidade_questoes, peso_por_questao (ex: 1.00), ordem_apresentacao.

regras_vista_prova

Configuração do modelo de consulta ao cartão-resposta pós-resultado.

    Campos principais: id, edital_id, tipo_procedimento (APENAS_RECURSO_ONLINE, VISTA_PRESENCIAL_ASSISTIDA), email_solicitacao, intersticio_minimo_horas_agendamento (ex: 72), exige_termo_visita_assinado (boolean).

7. Módulo de Conteúdo Programático
conteudo_programatico

Ementas que formam o Anexo de estudos do edital.

    Campos principais: id, edital_id, cargo_id (nullable se for comum a todos), nome_disciplina, texto_ementa (detalhamento dos tópicos).

8. Módulo da Prova de Títulos (Condicional)
titulos_categorias

Tabela de pontuação de pós-graduações e qualificações acadêmicas (Edital 002).

    Campos principais: id, edital_cargo_id, nivel_titulo (DOUTORADO, MESTRADO_PROFISSIONAL, ESPECIALIZACAO_LATO_SENSU), area_exigida (ex: "Tecnologias Digitais na Educação"), carga_horaria_minima_horas (ex: 360), pontos_por_item (ex: 4.0), limite_itens_aceitos (ex: 1), pontuacao_maxima_categoria (ex: 4.0), exige_historico_anexo (boolean - true).

titulos_regras_gerais

Regras de barreira para a prova de títulos.

    Campos principais: id, edital_id, teto_maximo_geral_pontos (ex: 12.0), dias_conclusao_previa_inscricao (ex: 30), exige_reconhecimento_mec_cne (boolean).

9. Módulo de Desempate e Resultado
criterios_desempate

Ordem sequencial de aplicação dos critérios de desempate.

    Campos principais: id, edital_cargo_id, ordem_prioridade (1, 2, 3...), criterio_tipo (ESTATUTO_IDOSO_60, FUNCAO_JURADO, PONTUACAO_DISCIPLINA, MAIOR_PONTOS_TITULOS, MAIOR_IDADE_DATA_HORA), disciplina_referencia_id (nullable).

criterios_desempate_pcd

Ordem de desempate exclusiva para lista de candidatos com deficiência (Leis Municipais 3.113/94 e 3.221/95).

    Campos principais: id, edital_id, ordem_prioridade, criterio_pcd (ARRIMO_FAMILIA, MAIOR_NUMERO_DEPENDENTES_ATE_21, AUSENCIA_FONTE_RENDA).

10. Módulo de Cronograma e Fluxo de Prazos
cronograma_etapas

Mapeamento de todas as datas-chave do certame.

    Campos principais: id, edital_id, nome_evento (ex: "Período de Inscrições", "Data da Prova Objetiva", "Vista da Folha de Respostas"), data_inicio, data_fim (nullable), horario_limite (ex: "16:00", "23:59"), permite_prorrogacao (boolean), ordem_cronologica.

11. Módulo de Investidura e Posse (Checklist Documental)
documentos_investidura

Documentação obrigatória para admissão, vinculada ao edital ou especificamente ao cargo.

    Campos principais: id, edital_id, cargo_id (nullable se for geral), nome_documento (ex: "Certidão de Quitação Eleitoral", "Diploma de Ensino Médio", "Certidão Nada Consta do COREN"), obrigatorio (boolean), aplica_apenas_sexo (AMBOS, MASCULINO — reservista), observacao (ex: "Apenas se declarar").

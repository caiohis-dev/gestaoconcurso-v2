Plano de Mitigação de Segurança: Módulo de Autenticação de Colaboradores

Prefácio: tudo aqui precisa ser checado frente ao código que é a fonte da verdade: tanto diagnóstico, quanto solução.

1. Descrição do Problema Encontrado (Falha Crítica)
Durante a análise arquitetural do módulo de autenticação e gestão de perfil de Colaboradores/Candidatos (useColaboradorAuth.tsx e migrações do Supabase associadas), identificou-se uma vulnerabilidade de segurança classificada como crítica, resultante de duas falhas conceituais sobrepostas:

Autenticação Fraca (Brute Force Fácil): O acesso à área do Colaborador é realizado via CPF e um "Código de Acesso" de apenas 4 dígitos (colab_codigo_acesso character(4)). Como este código possui apenas 10.000 combinações possíveis e não há bloqueio por excesso de tentativas na função verify_colaborador_codigo_acesso, é possível que um atacante descubra a senha de qualquer CPF em questão de minutos através da API. Além disso, o código de acesso é salvo no banco de dados em texto puro (plaintext), o que expõe a base de dados de forma severa em caso de vazamento.
Bypass de Segurança de Linha (RLS) e IDOR: Ao fazer "login", o frontend não gera um token JWT validado pelo Supabase Auth. Em vez disso, a sessão é apenas anotada localmente no localStorage. Para contornar a falta de um token de sessão verdadeiro nas políticas do banco, as funções responsáveis por atualizar informações sensíveis (como update_colaborador_data_full e update_colaborador_bank_data para Chave Pix) foram criadas com a flag SECURITY DEFINER. Isso significa que elas rodam no banco de dados com superpoderes e ignoram as regras de RLS (Row Level Security). Consequentemente, qualquer indivíduo com a chave pública do projeto (anon key) pode modificar ou extrair os dados pessoais e bancários de QUALQUER colaborador, bastando enviar o UUID correto do alvo na requisição HTTP.
Para solucionar isso em definitivo, desenhou-se o roadmap abaixo.

2. Roadmap de Solução (Passo a Passo)
Fase 1: Adequação da Engenharia de Login (Supabase Auth)
Objetivo: Transformar o Colaborador em um usuário real (com token JWT seguro), garantindo proteção nativa contra força bruta.

Etapa 1.1: Estratégia de Identidade (Auth.Users) Criar um gatilho (trigger) ou fluxo que, ao criar um colaborador, crie também um usuário na tabela nativa de segurança (auth.users) usando um e-mail estruturado fictício para atender a exigência do Supabase, como [CPF_LIMPO]@colaboradores.sistema.com.
Etapa 1.2: Substituir o Código de Acesso (Plaintext) O código de acesso de 4 dígitos passará a ser a password oficial na tabela auth.users. O Supabase cuidará automaticamente do hash (Bcrypt) e do salting, impossibilitando a visualização da senha no banco.
Etapa 1.3: Script de Migração da Base Atual Escrever e executar um script SQL ou Node para varrer todos os colaboradores que já existem, ler seus CPFs e os códigos originais, e injetá-los automaticamente na tabela auth.users.
Etapa 1.4: Bloqueio de Força Bruta (Rate Limiting) Configurar os controles nativos do Supabase Auth para realizar o travamento temporário da conta após tentativas incorretas de login, barrando scripts de força bruta.
Fase 2: Blindagem do Banco de Dados (Row Level Security)
Objetivo: Travar o banco de dados em nível de linha para impedir o IDOR e interceptação de dados via API.

Etapa 2.1: Relacionamento de Tabelas Adicionar uma coluna auth_user_id (do tipo UUID) na tabela colaboradores, apontando como ForeignKey para a conta recém-criada na tabela auth.users.
Etapa 2.2: Habilitar o RLS Executar o comando de blindagem: ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;.
Etapa 2.3: Políticas de Leitura (SELECT) Criar a regra de leitura no banco: "O colaborador só pode consultar dados se a linha tiver o auth_user_id perfeitamente igual ao seu próprio ID de autenticação atual validado pelo JWT (auth.uid())".
Etapa 2.4: Políticas de Escrita (UPDATE) Criar a regra de edição no banco: "O colaborador só pode editar o próprio perfil e chave PIX se o token JWT logado pertencer àquela exata linha da tabela".
Fase 3: Refatoração do Frontend (React)
Objetivo: Adaptar o painel do Colaborador para utilizar a nova arquitetura segura.

Etapa 3.1: Atualizar o Hook useColaboradorAuth.tsx Remover a gravação manual da sessão no localStorage. Modificar a função signIn para utilizar o cliente padrão: supabase.auth.signInWithPassword({ email: '[cpf_limpo]@colaboradores.sistema.com', password: codigoAcesso }).
Etapa 3.2: Ajustar a Busca de Perfil Na página PerfilColaborador.tsx, substituir as consultas antigas pelas chamadas diretas de .select() do Supabase, aproveitando que o RLS agora garantirá de forma impenetrável a devolução apenas dos dados autorizados pelo JWT.
Etapa 3.3: Ajustar o Salvamento de Perfil Substituir as chamadas de RPCs antigas e vazadas (ex: update_colaborador_bank_data) por queries padrões: supabase.from('colaboradores').update({ chave_pix: '...' }).eq('auth_user_id', user.id).
Fase 4: Descomissionamento e Faxina (Limpeza de Brechas)
Objetivo: Fechar as portas deixadas para trás no banco de dados e apagar dados inseguros.

Etapa 4.1: Remoção das RPCs Inseguras Deletar as funções de banco que estão expostas para a chave pública (anon) sem verificação JWT adequada:
DROP FUNCTION update_colaborador_data_full;
DROP FUNCTION update_colaborador_bank_data;
DROP FUNCTION verify_colaborador_codigo_acesso;
Etapa 4.2: Exclusão de Coluna Vulnerável Após confirmar que todos fazem login pelo Supabase Auth, executar a exclusão da coluna colab_codigo_acesso da tabela colaboradores, expurgando as senhas em texto puro do sistema de vez.

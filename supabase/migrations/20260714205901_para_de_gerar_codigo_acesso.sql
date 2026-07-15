-- Subetapa 2C: o código de 4 dígitos morre do fluxo de cadastro.
--
-- generate_codigo_acesso() era um trigger BEFORE INSERT que preenchia
-- colab_codigo_acesso com 4 dígitos aleatórios quando nenhum vinha. Era o último
-- escritor ativo do código: o cadastro público (2C) e o admin-create pararam de
-- enviá-lo, mas o trigger seguia gerando um valor morto a cada linha nova.
--
-- Nada lê o código desde a subetapa 2A. Removo o trigger e a função para que
-- colaboradores novos nasçam com colab_codigo_acesso NULL.
--
-- A COLUNA colab_codigo_acesso FICA (com o CHECK de formato, que aceita NULL) — o
-- DROP dela é limpeza da etapa 3/2D, junto das outras sobras do modelo velho. Não há
-- unique sobre ela, então os NULLs convivem sem problema.

DROP TRIGGER IF EXISTS generate_codigo_acesso_trigger ON public.colaboradores;
DROP FUNCTION IF EXISTS public.generate_codigo_acesso();

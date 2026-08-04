-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `candidatos` ganha SALA ESPECIAL — o pedido de atendimento especial do inscrito
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Decisão do usuário (2026-08-04): a importação de inscritos passa a trazer um campo novo,
-- NÃO obrigatório, com o pedido de sala/atendimento especial da pessoa (ledor, prova
-- ampliada, sala térrea, tempo adicional…). Ele entra na UI de pareamento, na ficha e —
-- linha por linha — nos dois relatórios da importação.
--
-- ── Por que `text` e não `varchar(2000)` ────────────────────────────────────────────────
--
-- O pedido original era `varchar(2000)`. Decisão do usuário no desenho: fica `text`, sem
-- teto. Duas razões, e a segunda é a que pesa:
--
--   1. É a regra da casa desde a migration 20260730100000 ("dado inválido entra cru"):
--      `candidatos` não tem opinião sobre o FORMATO de nada. Quatro CHECKs saíram e três
--      colunas viraram `text` naquele dia. Um `varchar(n)` aqui reintroduziria opinião.
--
--   2. 🔴 `varchar(n)` no Postgres RECUSA o valor maior — não trunca. E a gravação da
--      importação inteira roda dentro de UMA transação (`trocar_candidatos_do_edital`):
--      uma única célula de 2.001 caracteres derrubaria a troca do edital INTEIRO, com
--      7.416 inscritos, por causa do campo mais periférico da tabela. O custo de errar o
--      teto é desproporcional ao que ele protegeria.
--
-- ⚠️ CONSEQUÊNCIA ACEITA, registrada para não virar achado repetido: sem teto, o texto
-- viaja inteiro para o relatório persistido, que TEM teto — `LIMITE_RELATORIO_BYTES`
-- (4 MB, no cliente) recusa a importação inteira se o relatório estourar. Medido antes
-- desta coluna: 163 bytes por linha de relatório, 37,8 KB no arquivo real de 7.416 linhas
-- (três ordens de grandeza de folga). Com o texto da sala especial no `Detalhe`, a ~500
-- caracteres por pedido o teto fica em ~7.300 pedidos. Continua improvável — sala especial
-- é minoria de qualquer lista — mas deixou de ser inalcançável. Se um dia doer, o lugar de
-- cortar é o `Detalhe` do relatório, NUNCA o valor gravado aqui.
--
-- ── O que esta migration NÃO precisa mexer, e é desenho, não sorte ──────────────────────
--
-- • `candidatos_importacao` (a tabela de preparo) guarda a linha como `jsonb` e a RPC
--   reidrata com `jsonb_populate_record(null::candidatos, …)` — mapeamento por NOME de
--   coluna. Foi escrito exatamente para isto (ver o comentário da 20260730120000): coluna
--   nova em `candidatos` atravessa preparo → RPC → gravação sem ninguém tocar em nenhum
--   dos dois. Há caso de bateria SQL provando a travessia, porque promessa de desenho não
--   é fato medido.
-- • RLS e grants: são por TABELA, não por coluna. As quatro policies de `candidatos`
--   (`has_role(auth.uid(), 'admin')`) já cobrem a coluna nova.
-- • O dump (`seed.local.sql`): NÃO se toca. Ele nomeia as colunas em cada `INSERT`, então
--   coluna nova e nullable simplesmente não aparece lá. ⚠️ O inverso da armadilha de
--   03/08 — quem exige cirurgia posicional no dump é `DROP COLUMN`, não `ADD COLUMN`.
-- ═══════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.candidatos
  ADD COLUMN sala_especial text;

COMMENT ON COLUMN public.candidatos.sala_especial IS
  'Pedido de sala/atendimento especial do inscrito (ledor, prova ampliada, sala térrea, '
  'tempo adicional…), COMO A ORIGEM MANDOU. Opcional no pareamento da importação. É text '
  'e não varchar(n) de propósito: a tabela não tem opinião sobre formato desde a migration '
  '20260730100000, e um teto recusaria a troca total do edital inteiro por causa de uma '
  'célula longa (varchar no Postgres recusa, não trunca). Nada aqui é validado nem '
  'normalizado — quem precisar de formato valida na LEITURA.';

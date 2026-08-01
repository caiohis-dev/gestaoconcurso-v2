select 'TABELA|'||table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all select 'COLUNA|'||table_name||'.'||column_name from information_schema.columns where table_schema='public'
union all select 'POLICY|'||tablename||'|'||policyname from pg_policies where schemaname='public'
union all select 'TRIGGER|'||event_object_table||'|'||trigger_name from information_schema.triggers where trigger_schema='public'
union all select 'CHECK|'||conname from pg_constraint where contype='c' and connamespace='public'::regnamespace
union all select 'FK|'||conname||'|'||confdeltype::text from pg_constraint where contype='f' and connamespace='public'::regnamespace
union all select 'FUNC|'||routine_name from information_schema.routines where routine_schema='public'
union all select 'INDEX|'||indexname from pg_indexes where schemaname='public';

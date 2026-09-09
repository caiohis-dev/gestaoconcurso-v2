---
layout: home

hero:
  name: "Wiki da FEVRE"
  text: "Gestão de Concursos"
  tagline: "Documentação oficial do sistema web para gerenciar a logística operacional de provas de concursos públicos."
  actions:
    - theme: brand
      text: Começar a Ler (Índice)
      link: /estrutura/00-indice
    - theme: alt
      text: Ver Arquitetura Geral
      link: /estrutura/transversais/arquitetura-geral

features:
  - title: 🏗️ Módulos
    details: Explore a documentação individual e as regras de negócio de cada módulo (Aplicação de Provas, Editais, Candidatos, Alocação).
    link: /estrutura/modulos/aplicacao-provas/00-modulo
  - title: 🔐 Segurança e Auth
    details: Regras de permissões, papéis de gestão, acesso do colaborador e como a RLS é estruturada no Supabase.
    link: /estrutura/transversais/auth-e-permissoes
  - title: ⚠️ Invariantes
    details: Antes de implementar ou alterar regras, consulte as invariantes e o manual de onde mora cada regra de negócio.
    link: /estrutura/transversais/invariantes
---

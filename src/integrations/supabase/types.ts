export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bancos: {
        Row: {
          apelido: string
          codigo_compe: string
          nome: string
        }
        Insert: {
          apelido: string
          codigo_compe: string
          nome: string
        }
        Update: {
          apelido?: string
          codigo_compe?: string
          nome?: string
        }
        Relationships: []
      }
      colaborador_sessions: {
        Row: {
          colaborador_id: string
          created_at: string | null
          id: string
          last_activity: string | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string | null
          id?: string
          last_activity?: string | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string | null
          id?: string
          last_activity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_sessions_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          agencia: string | null
          agencia_dv: string | null
          codigo_banco: string | null
          colab_bairro: string | null
          colab_cep: number | null
          colab_chave_pix: string | null
          colab_cidade: string | null
          colab_codigo_acesso: string | null
          colab_complemento_endereco: string | null
          colab_cpf: string
          colab_data_nascimento: string
          colab_deficiente: boolean
          colab_email: string | null
          colab_estado_civil: number | null
          colab_grau_instrucao: number | null
          colab_matricula: string | null
          colab_nacionalidade: string | null
          colab_nome_completo: string
          colab_numero_casa: number | null
          colab_pis: string | null
          colab_raca: number | null
          colab_rua: string | null
          colab_senha: string | null
          colab_telefone: number | null
          colab_ultimo_acesso: string | null
          conta: string | null
          conta_dv: string | null
          created_at: string | null
          created_by: string | null
          id: string
          tipo_chave_pix: string | null
          tipo_conta: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agencia?: string | null
          agencia_dv?: string | null
          codigo_banco?: string | null
          colab_bairro?: string | null
          colab_cep?: number | null
          colab_chave_pix?: string | null
          colab_cidade?: string | null
          colab_codigo_acesso?: string | null
          colab_complemento_endereco?: string | null
          colab_cpf: string
          colab_data_nascimento: string
          colab_deficiente?: boolean
          colab_email?: string | null
          colab_estado_civil?: number | null
          colab_grau_instrucao?: number | null
          colab_matricula?: string | null
          colab_nacionalidade?: string | null
          colab_nome_completo: string
          colab_numero_casa?: number | null
          colab_pis?: string | null
          colab_raca?: number | null
          colab_rua?: string | null
          colab_senha?: string | null
          colab_telefone?: number | null
          colab_ultimo_acesso?: string | null
          conta?: string | null
          conta_dv?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          tipo_chave_pix?: string | null
          tipo_conta?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agencia?: string | null
          agencia_dv?: string | null
          codigo_banco?: string | null
          colab_bairro?: string | null
          colab_cep?: number | null
          colab_chave_pix?: string | null
          colab_cidade?: string | null
          colab_codigo_acesso?: string | null
          colab_complemento_endereco?: string | null
          colab_cpf?: string
          colab_data_nascimento?: string
          colab_deficiente?: boolean
          colab_email?: string | null
          colab_estado_civil?: number | null
          colab_grau_instrucao?: number | null
          colab_matricula?: string | null
          colab_nacionalidade?: string | null
          colab_nome_completo?: string
          colab_numero_casa?: number | null
          colab_pis?: string | null
          colab_raca?: number | null
          colab_rua?: string | null
          colab_senha?: string | null
          colab_telefone?: number | null
          colab_ultimo_acesso?: string | null
          conta?: string | null
          conta_dv?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          tipo_chave_pix?: string | null
          tipo_conta?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_colaboradores_banco"
            columns: ["codigo_banco"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["codigo_compe"]
          },
        ]
      }
      colaboradores_prova: {
        Row: {
          colaborador_id: string
          created_at: string | null
          created_by: string | null
          funcao_id: string | null
          id: string
          prova_unidade_id: string
          valor_pagamento: number | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string | null
          created_by?: string | null
          funcao_id?: string | null
          id?: string
          prova_unidade_id: string
          valor_pagamento?: number | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string | null
          created_by?: string | null
          funcao_id?: string | null
          id?: string
          prova_unidade_id?: string
          valor_pagamento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_prova_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_prova_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_prova_prova_unidade_id_fkey"
            columns: ["prova_unidade_id"]
            isOneToOne: false
            referencedRelation: "prova_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      coordenadores_prova: {
        Row: {
          colaborador_prova_id: string
          created_at: string | null
          created_by: string | null
          id: string
          prova_id: string
          user_id: string
        }
        Insert: {
          colaborador_prova_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          prova_id: string
          user_id: string
        }
        Update: {
          colaborador_prova_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          prova_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordenadores_prova_colaborador_prova_id_fkey"
            columns: ["colaborador_prova_id"]
            isOneToOne: true
            referencedRelation: "colaboradores_prova"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordenadores_prova_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_atualizacao_log: {
        Row: {
          colaborador_id: string
          email: string
          error_message: string | null
          id: string
          prova_id: string
          sent_at: string
          sent_by: string | null
          status: string
        }
        Insert: {
          colaborador_id: string
          email: string
          error_message?: string | null
          id?: string
          prova_id: string
          sent_at?: string
          sent_by?: string | null
          status: string
        }
        Update: {
          colaborador_id?: string
          email?: string
          error_message?: string | null
          id?: string
          prova_id?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_atualizacao_log_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_atualizacao_log_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
        ]
      }
      funcoes_colaboradores: {
        Row: {
          cargo_cbo: string | null
          cargo_descricao: string | null
          cargo_editavel: boolean | null
          cargo_nome: string
          created_at: string | null
          created_by: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          cargo_cbo?: string | null
          cargo_descricao?: string | null
          cargo_editavel?: boolean | null
          cargo_nome: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          cargo_cbo?: string | null
          cargo_descricao?: string | null
          cargo_editavel?: boolean | null
          cargo_nome?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_colaboradores_unidade: {
        Row: {
          created_at: string | null
          created_by: string | null
          funcao_id: string
          id: string
          prova_unidade_id: string
          quantidade_meta: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          funcao_id: string
          id?: string
          prova_unidade_id: string
          quantidade_meta?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          funcao_id?: string
          id?: string
          prova_unidade_id?: string
          quantidade_meta?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_colaboradores_unidade_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_colaboradores_unidade_prova_unidade_id_fkey"
            columns: ["prova_unidade_id"]
            isOneToOne: false
            referencedRelation: "prova_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      ocorrencias_colaborador: {
        Row: {
          colaborador_id: string
          created_at: string
          created_by: string | null
          data_ocorrencia: string
          descricao: string
          id: string
          prova_id: string
          prova_unidade_id: string
          substituido: number
          substituto_id: string | null
          tipo_ocorrencia: string | null
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          data_ocorrencia?: string
          descricao: string
          id?: string
          prova_id: string
          prova_unidade_id: string
          substituido?: number
          substituto_id?: string | null
          tipo_ocorrencia?: string | null
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          data_ocorrencia?: string
          descricao?: string
          id?: string
          prova_id?: string
          prova_unidade_id?: string
          substituido?: number
          substituto_id?: string | null
          tipo_ocorrencia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocorrencias_colaborador_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencias_colaborador_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencias_colaborador_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencias_colaborador_prova_unidade_id_fkey"
            columns: ["prova_unidade_id"]
            isOneToOne: false
            referencedRelation: "prova_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencias_colaborador_substituto_id_fkey"
            columns: ["substituto_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      prova_edit_locks: {
        Row: {
          id: string
          last_activity: string
          locked_at: string
          prova_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          id?: string
          last_activity?: string
          locked_at?: string
          prova_id: string
          user_id: string
          user_name: string
        }
        Update: {
          id?: string
          last_activity?: string
          locked_at?: string
          prova_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "prova_edit_locks_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: true
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
        ]
      }
      prova_unidades: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          ocorrencias_encerradas: boolean
          ocorrencias_encerradas_at: string | null
          ocorrencias_encerradas_by: string | null
          prova_id: string
          unidade_finalizada: boolean
          unidade_finalizada_at: string | null
          unidade_finalizada_by: string | null
          unidade_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          ocorrencias_encerradas?: boolean
          ocorrencias_encerradas_at?: string | null
          ocorrencias_encerradas_by?: string | null
          prova_id: string
          unidade_finalizada?: boolean
          unidade_finalizada_at?: string | null
          unidade_finalizada_by?: string | null
          unidade_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          ocorrencias_encerradas?: boolean
          ocorrencias_encerradas_at?: string | null
          ocorrencias_encerradas_by?: string | null
          prova_id?: string
          unidade_finalizada?: boolean
          unidade_finalizada_at?: string | null
          unidade_finalizada_by?: string | null
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prova_unidades_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prova_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_prova"
            referencedColumns: ["id"]
          },
        ]
      }
      provas: {
        Row: {
          created_at: string | null
          created_by: string | null
          finalizada_at: string | null
          id: string
          prova_cabecalho_linha1: string | null
          prova_cabecalho_linha2: string | null
          prova_data: string | null
          prova_edital: string
          prova_finalizada: boolean
          prova_hora_final: string | null
          prova_hora_inicio: string | null
          prova_n_candidatos: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          finalizada_at?: string | null
          id?: string
          prova_cabecalho_linha1?: string | null
          prova_cabecalho_linha2?: string | null
          prova_data?: string | null
          prova_edital: string
          prova_finalizada?: boolean
          prova_hora_final?: string | null
          prova_hora_inicio?: string | null
          prova_n_candidatos?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          finalizada_at?: string | null
          id?: string
          prova_cabecalho_linha1?: string | null
          prova_cabecalho_linha2?: string | null
          prova_data?: string | null
          prova_edital?: string
          prova_finalizada?: boolean
          prova_hora_final?: string | null
          prova_hora_inicio?: string | null
          prova_n_candidatos?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sala_prova: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          sala_andar: number | null
          sala_arcondicionado: boolean | null
          sala_capacidade: number
          sala_descricao: string | null
          sala_fk_unidade: string
          sala_numero: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          sala_andar?: number | null
          sala_arcondicionado?: boolean | null
          sala_capacidade: number
          sala_descricao?: string | null
          sala_fk_unidade: string
          sala_numero: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          sala_andar?: number | null
          sala_arcondicionado?: boolean | null
          sala_capacidade?: number
          sala_descricao?: string | null
          sala_fk_unidade?: string
          sala_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sala_prova_sala_fk_unidade_fkey"
            columns: ["sala_fk_unidade"]
            isOneToOne: false
            referencedRelation: "unidades_prova"
            referencedColumns: ["id"]
          },
        ]
      }
      salas_prova_distribuidas: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          prova_id: string
          sala_andar: number | null
          sala_capacidade: number
          sala_descricao: string | null
          sala_fiscal_1: string | null
          sala_fiscal_2: string | null
          sala_fk_unidade: string
          sala_numero: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          prova_id: string
          sala_andar?: number | null
          sala_capacidade: number
          sala_descricao?: string | null
          sala_fiscal_1?: string | null
          sala_fiscal_2?: string | null
          sala_fk_unidade: string
          sala_numero: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          prova_id?: string
          sala_andar?: number | null
          sala_capacidade?: number
          sala_descricao?: string | null
          sala_fiscal_1?: string | null
          sala_fiscal_2?: string | null
          sala_fk_unidade?: string
          sala_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salas_prova_distribuidas_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_prova_distribuidas_sala_fiscal_1_fkey"
            columns: ["sala_fiscal_1"]
            isOneToOne: false
            referencedRelation: "colaboradores_prova"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_prova_distribuidas_sala_fiscal_2_fkey"
            columns: ["sala_fiscal_2"]
            isOneToOne: false
            referencedRelation: "colaboradores_prova"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_prova_distribuidas_sala_fk_unidade_fkey"
            columns: ["sala_fk_unidade"]
            isOneToOne: false
            referencedRelation: "unidades_prova"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades_prova: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          unid_andares: number
          unid_nome: string
          unid_sigla: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          unid_andares: number
          unid_nome: string
          unid_sigla: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          unid_andares?: number
          unid_nome?: string
          unid_sigla?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      valores_funcao_prova: {
        Row: {
          created_at: string | null
          created_by: string | null
          funcao_id: string
          id: string
          prova_id: string
          updated_at: string | null
          valor_pagamento: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          funcao_id: string
          id?: string
          prova_id: string
          updated_at?: string | null
          valor_pagamento?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          funcao_id?: string
          id?: string
          prova_id?: string
          updated_at?: string | null
          valor_pagamento?: number
        }
        Relationships: [
          {
            foreignKeyName: "valores_funcao_prova_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valores_funcao_prova_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_prova_lock: {
        Args: { p_prova_id: string; p_user_id: string; p_user_name: string }
        Returns: {
          locked_by_name: string
          locked_since: string
          success: boolean
        }[]
      }
      assign_coordenador_role: {
        Args: {
          p_colaborador_prova_id: string
          p_prova_id: string
          p_user_id: string
        }
        Returns: string
      }
      check_colaborador_has_password: {
        Args: { p_cpf: string }
        Returns: boolean
      }
      check_prova_lock: {
        Args: { p_prova_id: string }
        Returns: {
          is_expired: boolean
          is_locked: boolean
          locked_at: string
          user_id: string
          user_name: string
        }[]
      }
      encerrar_ocorrencias_unidade: {
        Args: { p_prova_unidade_id: string; p_user_id: string }
        Returns: boolean
      }
      finalizar_prova: {
        Args: { p_prova_id: string; p_user_id: string }
        Returns: boolean
      }
      finalizar_prova_unidade: {
        Args: { p_prova_unidade_id: string; p_user_id: string }
        Returns: boolean
      }
      get_colaborador_by_id: {
        Args: { p_colaborador_id: string }
        Returns: {
          cpf: string
          id: string
          nome_completo: string
        }[]
      }
      get_colaborador_full_data: {
        Args: { p_colaborador_id: string }
        Returns: {
          agencia: string
          agencia_dv: string
          codigo_banco: string
          colab_bairro: string
          colab_cep: number
          colab_chave_pix: string
          colab_cidade: string
          colab_complemento_endereco: string
          colab_cpf: string
          colab_data_nascimento: string
          colab_deficiente: boolean
          colab_email: string
          colab_estado_civil: number
          colab_grau_instrucao: number
          colab_matricula: string
          colab_nacionalidade: string
          colab_nome_completo: string
          colab_numero_casa: number
          colab_pis: string
          colab_raca: number
          colab_rua: string
          colab_telefone: number
          conta: string
          conta_dv: string
          id: string
          tipo_conta: string
        }[]
      }
      get_coordenador_colaboradores: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      get_coordenador_prova_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      get_coordenador_prova_unidade_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      get_meu_colaborador: {
        Args: never
        Returns: {
          agencia: string
          agencia_dv: string
          codigo_banco: string
          colab_bairro: string
          colab_cep: number
          colab_chave_pix: string
          colab_cidade: string
          colab_complemento_endereco: string
          colab_cpf: string
          colab_data_nascimento: string
          colab_deficiente: boolean
          colab_email: string
          colab_estado_civil: number
          colab_grau_instrucao: number
          colab_matricula: string
          colab_nacionalidade: string
          colab_nome_completo: string
          colab_numero_casa: number
          colab_pis: string
          colab_raca: number
          colab_rua: string
          colab_telefone: number
          conta: string
          conta_dv: string
          id: string
          tipo_conta: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_password: { Args: { password: string }; Returns: string }
      is_colaborador_logged_in: {
        Args: { p_colaborador_id: string }
        Returns: boolean
      }
      is_coordenador_prova: {
        Args: { p_prova_id: string; p_user_id: string }
        Returns: boolean
      }
      meu_colaborador_id: { Args: never; Returns: string }
      reabrir_prova: {
        Args: { p_prova_id: string; p_user_id: string }
        Returns: boolean
      }
      reabrir_prova_unidade: {
        Args: { p_prova_unidade_id: string; p_user_id: string }
        Returns: boolean
      }
      register_colaborador_session: {
        Args: { p_colaborador_id: string }
        Returns: undefined
      }
      release_prova_lock: {
        Args: { p_prova_id: string; p_user_id: string }
        Returns: boolean
      }
      set_colaborador_password: {
        Args: { p_colaborador_id: string; p_password: string }
        Returns: boolean
      }
      unregister_colaborador_session: {
        Args: { p_colaborador_id: string }
        Returns: undefined
      }
      update_colaborador_bank_data: {
        Args: {
          p_agencia: string
          p_agencia_dv: string
          p_codigo_banco: string
          p_colaborador_id: string
          p_conta: string
          p_conta_dv: string
          p_tipo_conta: string
        }
        Returns: boolean
      }
      update_colaborador_data:
        | {
            Args: {
              p_bairro: string
              p_cep: number
              p_cidade: string
              p_colaborador_id: string
              p_complemento: string
              p_deficiente: boolean
              p_estado_civil: number
              p_grau_instrucao: number
              p_matricula: string
              p_numero_casa: number
              p_pis: string
              p_raca: number
              p_rua: string
              p_telefone: number
            }
            Returns: boolean
          }
        | {
            Args: {
              p_bairro: string
              p_cep: number
              p_chave_pix: string
              p_cidade: string
              p_colaborador_id: string
              p_complemento: string
              p_deficiente: boolean
              p_email: string
              p_estado_civil: number
              p_grau_instrucao: number
              p_matricula: string
              p_numero_casa: number
              p_pis: string
              p_raca: number
              p_rua: string
              p_telefone: number
            }
            Returns: boolean
          }
        | {
            Args: {
              p_bairro: string
              p_cep: number
              p_cidade: string
              p_colaborador_id: string
              p_complemento: string
              p_deficiente: boolean
              p_estado_civil: number
              p_grau_instrucao: number
              p_numero_casa: number
              p_raca: number
              p_rua: string
              p_telefone: number
            }
            Returns: boolean
          }
      update_colaborador_data_full: {
        Args: {
          p_bairro: string
          p_cep: number
          p_chave_pix: string
          p_cidade: string
          p_colaborador_id: string
          p_complemento: string
          p_cpf: string
          p_data_nascimento: string
          p_deficiente: boolean
          p_email: string
          p_estado_civil: number
          p_grau_instrucao: number
          p_matricula: string
          p_nacionalidade: string
          p_nome_completo: string
          p_numero_casa: number
          p_pis: string
          p_raca: number
          p_rua: string
          p_telefone: number
        }
        Returns: boolean
      }
      update_colaborador_session_activity: {
        Args: { p_colaborador_id: string }
        Returns: undefined
      }
      update_meu_colaborador: {
        Args: {
          p_bairro: string
          p_cep: number
          p_chave_pix: string
          p_cidade: string
          p_complemento: string
          p_cpf: string
          p_data_nascimento: string
          p_deficiente: boolean
          p_email: string
          p_estado_civil: number
          p_grau_instrucao: number
          p_matricula: string
          p_nacionalidade: string
          p_nome_completo: string
          p_numero_casa: number
          p_pis: string
          p_raca: number
          p_rua: string
          p_telefone: number
        }
        Returns: boolean
      }
      update_meus_dados_bancarios: {
        Args: {
          p_agencia: string
          p_agencia_dv: string
          p_codigo_banco: string
          p_conta: string
          p_conta_dv: string
          p_tipo_conta: string
        }
        Returns: boolean
      }
      update_prova_lock_activity: {
        Args: { p_prova_id: string; p_user_id: string }
        Returns: boolean
      }
      verify_colaborador_codigo_acesso: {
        Args: { p_codigo: string; p_cpf: string }
        Returns: string
      }
      verify_colaborador_first_access: {
        Args: { p_cpf: string; p_data_nascimento: string }
        Returns: {
          cpf: string
          id: string
          nome_completo: string
        }[]
      }
      verify_colaborador_password: {
        Args: { p_cpf: string; p_password: string }
        Returns: string
      }
      verify_user_password: {
        Args: { p_email: string; p_password: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "coordenador" | "superadmin" | "colaborador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "user", "coordenador", "superadmin", "colaborador"],
    },
  },
} as const


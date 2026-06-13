export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_integrations: {
        Row: {
          allow_agent_use: boolean
          auth_header_name: string | null
          auth_token: string | null
          auth_type: string
          base_url: string
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          last_validated_at: string | null
          last_validation_error: string | null
          last_validation_status: string | null
          name: string
          secret_ref: string | null
          updated_at: string
        }
        Insert: {
          allow_agent_use?: boolean
          auth_header_name?: string | null
          auth_token?: string | null
          auth_type?: string
          base_url: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          name: string
          secret_ref?: string | null
          updated_at?: string
        }
        Update: {
          allow_agent_use?: boolean
          auth_header_name?: string | null
          auth_token?: string | null
          auth_type?: string
          base_url?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          name?: string
          secret_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          action: string
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          id: string
          input_summary: string | null
          payload: Json
          requested_by: string | null
          risk_level: string
          status: Database["public"]["Enums"]["approval_status"]
          tool_name: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          input_summary?: string | null
          payload?: Json
          requested_by?: string | null
          risk_level?: string
          status?: Database["public"]["Enums"]["approval_status"]
          tool_name?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          input_summary?: string | null
          payload?: Json
          requested_by?: string | null
          risk_level?: string
          status?: Database["public"]["Enums"]["approval_status"]
          tool_name?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approvals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          approved_by: string | null
          created_at: string
          id: string
          payload: Json
          target: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          payload?: Json
          target?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          payload?: Json
          target?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          model: string | null
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          model?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          model?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      database_connections: {
        Row: {
          connection_url: string | null
          created_at: string
          created_by: string | null
          db_type: string
          enabled: boolean
          id: string
          last_validated_at: string | null
          last_validation_error: string | null
          last_validation_status: string | null
          name: string
          secret_ref: string | null
          updated_at: string
        }
        Insert: {
          connection_url?: string | null
          created_at?: string
          created_by?: string | null
          db_type: string
          enabled?: boolean
          id?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          name: string
          secret_ref?: string | null
          updated_at?: string
        }
        Update: {
          connection_url?: string | null
          created_at?: string
          created_by?: string | null
          db_type?: string
          enabled?: boolean
          id?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          name?: string
          secret_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          parts: Json
          role: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          parts: Json
          role: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          parts?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          severity: Database["public"]["Enums"]["notification_severity"]
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          severity?: Database["public"]["Enums"]["notification_severity"]
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          severity?: Database["public"]["Enums"]["notification_severity"]
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_configs: {
        Row: {
          api_key_encrypted: string | null
          base_url: string | null
          created_at: string
          created_by: string | null
          default_model: string | null
          enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["provider_kind"]
          last_validated_at: string | null
          last_validation_error: string | null
          last_validation_status: string | null
          models: Json
          name: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          default_model?: string | null
          enabled?: boolean
          id?: string
          kind: Database["public"]["Enums"]["provider_kind"]
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          models?: Json
          name: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          default_model?: string | null
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["provider_kind"]
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          models?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      servers: {
        Row: {
          adapter_mode: string
          created_at: string
          created_by: string | null
          daemon_token: string | null
          daemon_url: string
          enabled: boolean
          host: string
          id: string
          last_health_at: string | null
          last_seen_at: string | null
          name: string
          status: string
          updated_at: string
          workspace_root: string | null
        }
        Insert: {
          adapter_mode?: string
          created_at?: string
          created_by?: string | null
          daemon_token?: string | null
          daemon_url: string
          enabled?: boolean
          host: string
          id?: string
          last_health_at?: string | null
          last_seen_at?: string | null
          name: string
          status?: string
          updated_at?: string
          workspace_root?: string | null
        }
        Update: {
          adapter_mode?: string
          created_at?: string
          created_by?: string | null
          daemon_token?: string | null
          daemon_url?: string
          enabled?: boolean
          host?: string
          id?: string
          last_health_at?: string | null
          last_seen_at?: string | null
          name?: string
          status?: string
          updated_at?: string
          workspace_root?: string | null
        }
        Relationships: []
      }
      storage_backends: {
        Row: {
          access_key_id: string | null
          bucket: string | null
          created_at: string
          created_by: string | null
          enabled: boolean
          endpoint: string | null
          id: string
          is_default: boolean
          last_validated_at: string | null
          last_validation_error: string | null
          last_validation_status: string | null
          name: string
          provider_type: string
          region: string | null
          secret_access_key: string | null
          secret_ref: string | null
          updated_at: string
        }
        Insert: {
          access_key_id?: string | null
          bucket?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          endpoint?: string | null
          id?: string
          is_default?: boolean
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          name: string
          provider_type: string
          region?: string | null
          secret_access_key?: string | null
          secret_ref?: string | null
          updated_at?: string
        }
        Update: {
          access_key_id?: string | null
          bucket?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          endpoint?: string | null
          id?: string
          is_default?: boolean
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          name?: string
          provider_type?: string
          region?: string | null
          secret_access_key?: string | null
          secret_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          agent_id: string | null
          created_at: string
          description: string | null
          files_changed: number
          id: string
          logs: Json
          progress: number
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          description?: string | null
          files_changed?: number
          id?: string
          logs?: Json
          progress?: number
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          description?: string | null
          files_changed?: number
          id?: string
          logs?: Json
          progress?: number
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          active_database_id: string | null
          active_provider_id: string | null
          active_storage_id: string | null
          allowed_paths: string[]
          command_permission_level: string
          created_at: string
          created_by: string | null
          default_branch: string | null
          env: Json
          file_access_policy: string
          id: string
          name: string
          path: string
          repo_url: string | null
          server_id: string | null
          updated_at: string
        }
        Insert: {
          active_database_id?: string | null
          active_provider_id?: string | null
          active_storage_id?: string | null
          allowed_paths?: string[]
          command_permission_level?: string
          created_at?: string
          created_by?: string | null
          default_branch?: string | null
          env?: Json
          file_access_policy?: string
          id?: string
          name: string
          path: string
          repo_url?: string | null
          server_id?: string | null
          updated_at?: string
        }
        Update: {
          active_database_id?: string | null
          active_provider_id?: string | null
          active_storage_id?: string | null
          allowed_paths?: string[]
          command_permission_level?: string
          created_at?: string
          created_by?: string | null
          default_branch?: string | null
          env?: Json
          file_access_policy?: string
          id?: string
          name?: string
          path?: string
          repo_url?: string | null
          server_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_active_provider_id_fkey"
            columns: ["active_provider_id"]
            isOneToOne: false
            referencedRelation: "provider_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member"
      approval_status: "pending" | "approved" | "denied" | "expired"
      notification_severity: "info" | "success" | "warning" | "error"
      provider_kind:
        | "openai"
        | "anthropic"
        | "google"
        | "openrouter"
        | "custom"
        | "ollama"
      task_status: "queued" | "waiting" | "running" | "completed" | "failed"
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
  public: {
    Enums: {
      app_role: ["admin", "member"],
      approval_status: ["pending", "approved", "denied", "expired"],
      notification_severity: ["info", "success", "warning", "error"],
      provider_kind: [
        "openai",
        "anthropic",
        "google",
        "openrouter",
        "custom",
        "ollama",
      ],
      task_status: ["queued", "waiting", "running", "completed", "failed"],
    },
  },
} as const

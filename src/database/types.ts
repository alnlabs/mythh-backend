export type UserRole = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type MythStatus = "PENDING" | "APPROVED" | "REJECTED";
export type MythVerdict = "TRUE" | "FALSE" | "PARTIALLY_TRUE" | "UNCERTAIN";
export type VoteValue = "TRUE" | "FALSE";
export type CommentStatus = "VISIBLE" | "HIDDEN";
export type ReportTarget = "MYTH" | "COMMENT";
export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          status: UserStatus;
          country_code: string | null;
          default_category_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          status?: UserStatus;
          country_code?: string | null;
          default_category_id?: string | null;
        };
        Update: {
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          status?: UserStatus;
          country_code?: string | null;
          default_category_id?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          slug: string;
          description?: string | null;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
        };
        Relationships: [];
      };
      myths: {
        Row: {
          id: string;
          title: string;
          slug: string;
          verdict: MythVerdict;
          explanation: string;
          category_id: string;
          creator_id: string | null;
          status: MythStatus;
          country_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          slug: string;
          verdict?: MythVerdict;
          explanation: string;
          category_id: string;
          creator_id?: string | null;
          status?: MythStatus;
          country_code?: string | null;
        };
        Update: {
          title?: string;
          slug?: string;
          verdict?: MythVerdict;
          explanation?: string;
          category_id?: string;
          creator_id?: string | null;
          status?: MythStatus;
          country_code?: string | null;
        };
        Relationships: [];
      };
      sources: {
        Row: {
          id: string;
          myth_id: string;
          title: string | null;
          url: string;
          created_at: string;
        };
        Insert: {
          myth_id: string;
          title?: string | null;
          url: string;
        };
        Update: {
          title?: string | null;
          url?: string;
        };
        Relationships: [];
      };
      votes: {
        Row: {
          id: string;
          myth_id: string;
          user_id: string | null;
          anonymous_id: string | null;
          value: VoteValue;
          is_correct: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          myth_id: string;
          user_id?: string | null;
          anonymous_id?: string | null;
          value: VoteValue;
          is_correct?: boolean;
        };
        Update: {
          value?: VoteValue;
          user_id?: string | null;
          anonymous_id?: string | null;
          is_correct?: boolean;
        };
        Relationships: [];
      };
      advertisements: {
        Row: {
          id: string;
          title: string;
          body: string | null;
          image_url: string | null;
          link_url: string | null;
          is_active: boolean;
          starts_at: string | null;
          ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          body?: string | null;
          image_url?: string | null;
          link_url?: string | null;
          is_active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
        };
        Update: {
          title?: string;
          body?: string | null;
          image_url?: string | null;
          link_url?: string | null;
          is_active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target: ReportTarget;
          myth_id: string | null;
          comment_id: string | null;
          reason: string;
          status: ReportStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          reporter_id?: string;
          target: ReportTarget;
          myth_id?: string | null;
          comment_id?: string | null;
          reason: string;
          status?: ReportStatus;
        };
        Update: {
          status?: ReportStatus;
          reason?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          myth_id: string;
          user_id: string;
          content: string;
          status: CommentStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          myth_id: string;
          user_id?: string;
          content: string;
          status?: CommentStatus;
        };
        Update: {
          content?: string;
          status?: CommentStatus;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_first_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      apply_admin_allowlist: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      cast_vote: {
        Args: {
          p_myth_id: string;
          p_value: VoteValue;
          p_anonymous_id?: string | null;
        };
        Returns: {
          vote_id: string;
          vote_value: VoteValue;
          is_correct: boolean;
          already_answered: boolean;
          correct_answer: string | null;
        }[];
      };
      claim_anonymous_votes: {
        Args: { p_anonymous_id: string };
        Returns: number;
      };
    };
    CompositeTypes: {
      [_ in never]: never;
    };
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      myth_status: MythStatus;
      myth_verdict: MythVerdict;
      vote_value: VoteValue;
      comment_status: CommentStatus;
      report_target: ReportTarget;
      report_status: ReportStatus;
    };
  };
};

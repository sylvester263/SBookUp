export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          admin_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          new_value: Json | null;
          old_value: Json | null;
        };
        Insert: {
          action: string;
          admin_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
        };
        Update: {
          action?: string;
          admin_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
        };
        Relationships: [];
      };
      addresses: {
        Row: {
          city: string;
          created_at: string;
          id: string;
          is_default: boolean;
          label: string | null;
          lat: number | null;
          lng: number | null;
          phone: string | null;
          postal_code: string | null;
          province: string | null;
          street: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          city: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label?: string | null;
          lat?: number | null;
          lng?: number | null;
          phone?: string | null;
          postal_code?: string | null;
          province?: string | null;
          street: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          city?: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label?: string | null;
          lat?: number | null;
          lng?: number | null;
          phone?: string | null;
          postal_code?: string | null;
          province?: string | null;
          street?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      attribute_definitions: {
        Row: {
          allow_new_options: boolean;
          created_at: string;
          help_text: string | null;
          id: string;
          is_active: boolean;
          is_filterable: boolean;
          is_variant_axis: boolean;
          key: string;
          label: string;
          options: Json;
          sort_order: number;
          type: string;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          allow_new_options?: boolean;
          created_at?: string;
          help_text?: string | null;
          id?: string;
          is_active?: boolean;
          is_filterable?: boolean;
          is_variant_axis?: boolean;
          key: string;
          label: string;
          options?: Json;
          sort_order?: number;
          type: string;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          allow_new_options?: boolean;
          created_at?: string;
          help_text?: string | null;
          id?: string;
          is_active?: boolean;
          is_filterable?: boolean;
          is_variant_axis?: boolean;
          key?: string;
          label?: string;
          options?: Json;
          sort_order?: number;
          type?: string;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      banners: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          image_url: string;
          is_active: boolean;
          link_url: string | null;
          position: Database["public"]["Enums"]["banner_position"];
          subtitle: string | null;
          title: string;
          valid_from: string | null;
          valid_until: string | null;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          image_url: string;
          is_active?: boolean;
          link_url?: string | null;
          position?: Database["public"]["Enums"]["banner_position"];
          subtitle?: string | null;
          title: string;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          image_url?: string;
          is_active?: boolean;
          link_url?: string | null;
          position?: Database["public"]["Enums"]["banner_position"];
          subtitle?: string | null;
          title?: string;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Relationships: [];
      };
      bundle_items: {
        Row: {
          bundle_id: string;
          id: string;
          product_id: string;
          quantity: number;
        };
        Insert: {
          bundle_id: string;
          id?: string;
          product_id: string;
          quantity?: number;
        };
        Update: {
          bundle_id?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      bundles: {
        Row: {
          class_level: string | null;
          created_at: string;
          description: string | null;
          discounted_price: number;
          exam_board: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          is_featured: boolean;
          name: string;
          school_name: string | null;
          slug: string;
          total_price: number;
          updated_at: string;
        };
        Insert: {
          class_level?: string | null;
          created_at?: string;
          description?: string | null;
          discounted_price?: number;
          exam_board?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          name: string;
          school_name?: string | null;
          slug: string;
          total_price?: number;
          updated_at?: string;
        };
        Update: {
          class_level?: string | null;
          created_at?: string;
          description?: string | null;
          discounted_price?: number;
          exam_board?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          name?: string;
          school_name?: string | null;
          slug?: string;
          total_price?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          bundle_id: string | null;
          created_at: string;
          id: string;
          product_id: string | null;
          quantity: number;
          session_id: string | null;
          user_id: string | null;
          variant_id: string | null;
        };
        Insert: {
          bundle_id?: string | null;
          created_at?: string;
          id?: string;
          product_id?: string | null;
          quantity?: number;
          session_id?: string | null;
          user_id?: string | null;
          variant_id?: string | null;
        };
        Update: {
          bundle_id?: string | null;
          created_at?: string;
          id?: string;
          product_id?: string | null;
          quantity?: number;
          session_id?: string | null;
          user_id?: string | null;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          default_pack_size: number | null;
          default_sell_unit: string;
          default_unit_label: string | null;
          description: string | null;
          display_order: number;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          parent_id: string | null;
          seo_description: string | null;
          seo_title: string | null;
          show_in_nav: boolean;
          show_on_home: boolean;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_pack_size?: number | null;
          default_sell_unit?: string;
          default_unit_label?: string | null;
          description?: string | null;
          display_order?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          parent_id?: string | null;
          seo_description?: string | null;
          seo_title?: string | null;
          show_in_nav?: boolean;
          show_on_home?: boolean;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_pack_size?: number | null;
          default_sell_unit?: string;
          default_unit_label?: string | null;
          description?: string | null;
          display_order?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          parent_id?: string | null;
          seo_description?: string | null;
          seo_title?: string | null;
          show_in_nav?: boolean;
          show_on_home?: boolean;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      category_attributes: {
        Row: {
          attribute_id: string;
          category_id: string;
          is_required: boolean;
          is_variant_axis: boolean;
          sort_order: number;
        };
        Insert: {
          attribute_id: string;
          category_id: string;
          is_required?: boolean;
          is_variant_axis?: boolean;
          sort_order?: number;
        };
        Update: {
          attribute_id?: string;
          category_id?: string;
          is_required?: boolean;
          is_variant_axis?: boolean;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "category_attributes_attribute_id_fkey";
            columns: ["attribute_id"];
            isOneToOne: false;
            referencedRelation: "attribute_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "category_attributes_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_messages: {
        Row: {
          archived_at: string | null;
          created_at: string;
          email: string;
          id: string;
          is_read: boolean;
          message: string;
          name: string;
          phone: string | null;
          replied_at: string | null;
          reply_body: string | null;
          subject: string | null;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          is_read?: boolean;
          message: string;
          name: string;
          phone?: string | null;
          replied_at?: string | null;
          reply_body?: string | null;
          subject?: string | null;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          name?: string;
          phone?: string | null;
          replied_at?: string | null;
          reply_body?: string | null;
          subject?: string | null;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          max_uses: number | null;
          min_order_amount: number;
          type: Database["public"]["Enums"]["coupon_type"];
          uses_count: number;
          valid_from: string | null;
          valid_until: string | null;
          value: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_order_amount?: number;
          type: Database["public"]["Enums"]["coupon_type"];
          uses_count?: number;
          valid_from?: string | null;
          valid_until?: string | null;
          value?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_order_amount?: number;
          type?: Database["public"]["Enums"]["coupon_type"];
          uses_count?: number;
          valid_from?: string | null;
          valid_until?: string | null;
          value?: number;
        };
        Relationships: [];
      };
      newsletter_campaigns: {
        Row: {
          body: string;
          created_at: string;
          failed_count: number;
          id: string;
          sent_by: string | null;
          sent_count: number;
          subject: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          failed_count?: number;
          id?: string;
          sent_by?: string | null;
          sent_count?: number;
          subject: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          failed_count?: number;
          id?: string;
          sent_by?: string | null;
          sent_count?: number;
          subject?: string;
        };
        Relationships: [];
      };
      newsletters: {
        Row: {
          email: string;
          id: string;
          name: string | null;
          subscribed_at: string;
          unsubscribe_token: string;
          unsubscribed_at: string | null;
        };
        Insert: {
          email: string;
          id?: string;
          name?: string | null;
          subscribed_at?: string;
          unsubscribe_token?: string;
          unsubscribed_at?: string | null;
        };
        Update: {
          email?: string;
          id?: string;
          name?: string | null;
          subscribed_at?: string;
          unsubscribe_token?: string;
          unsubscribed_at?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          bundle_id: string | null;
          id: string;
          name_snapshot: string;
          order_id: string;
          pack_size: number | null;
          price_snapshot: number;
          product_id: string | null;
          quantity: number;
          school_bundle_id: string | null;
          sell_unit: string | null;
          subtotal: number;
          variant_id: string | null;
          variant_options: Json | null;
        };
        Insert: {
          bundle_id?: string | null;
          id?: string;
          name_snapshot: string;
          order_id: string;
          pack_size?: number | null;
          price_snapshot: number;
          product_id?: string | null;
          quantity: number;
          school_bundle_id?: string | null;
          sell_unit?: string | null;
          subtotal: number;
          variant_id?: string | null;
          variant_options?: Json | null;
        };
        Update: {
          bundle_id?: string | null;
          id?: string;
          name_snapshot?: string;
          order_id?: string;
          pack_size?: number | null;
          price_snapshot?: number;
          product_id?: string | null;
          quantity?: number;
          school_bundle_id?: string | null;
          sell_unit?: string | null;
          subtotal?: number;
          variant_id?: string | null;
          variant_options?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_school_bundle_id_fkey";
            columns: ["school_bundle_id"];
            isOneToOne: false;
            referencedRelation: "school_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          coupon_code: string | null;
          coupon_counted: boolean;
          created_at: string;
          discount_amount: number;
          guest_email: string | null;
          id: string;
          notes: string | null;
          order_number: string;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_proof_path: string | null;
          payment_proof_uploaded_at: string | null;
          payment_reference: string | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          restocked_at: string | null;
          shipping_address: Json;
          shipping_cost: number;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tax_amount: number;
          total: number;
          tracking_number: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          coupon_code?: string | null;
          coupon_counted?: boolean;
          created_at?: string;
          discount_amount?: number;
          guest_email?: string | null;
          id?: string;
          notes?: string | null;
          order_number: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_proof_path?: string | null;
          payment_proof_uploaded_at?: string | null;
          payment_reference?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          restocked_at?: string | null;
          shipping_address: Json;
          shipping_cost?: number;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          tax_amount?: number;
          total?: number;
          tracking_number?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          coupon_code?: string | null;
          coupon_counted?: boolean;
          created_at?: string;
          discount_amount?: number;
          guest_email?: string | null;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_proof_path?: string | null;
          payment_proof_uploaded_at?: string | null;
          payment_reference?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          restocked_at?: string | null;
          shipping_address?: Json;
          shipping_cost?: number;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          tax_amount?: number;
          total?: number;
          tracking_number?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          category_id: string;
          created_at: string;
          is_primary: boolean;
          product_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          is_primary?: boolean;
          product_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          is_primary?: boolean;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_categories_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          attributes: Json;
          created_at: string;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          option_values: Json;
          price: number | null;
          price_modifier: number;
          product_id: string;
          sku: string | null;
          stock: number;
          weight_grams: number | null;
        };
        Insert: {
          attributes?: Json;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          option_values?: Json;
          price?: number | null;
          price_modifier?: number;
          product_id: string;
          sku?: string | null;
          stock?: number;
          weight_grams?: number | null;
        };
        Update: {
          attributes?: Json;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          option_values?: Json;
          price?: number | null;
          price_modifier?: number;
          product_id?: string;
          sku?: string | null;
          stock?: number;
          weight_grams?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          attributes: Json;
          author: string | null;
          brand: string | null;
          category_id: string | null;
          cost_price: number | null;
          created_at: string;
          description: string | null;
          edition: string | null;
          id: string;
          images: string[];
          is_active: boolean;
          is_featured: boolean;
          is_new_arrival: boolean;
          isbn: string | null;
          low_stock_threshold: number;
          name: string;
          new_arrival_until: string | null;
          pack_size: number | null;
          price: number;
          publisher: string | null;
          sale_price: number | null;
          sales_count: number;
          sell_unit: string;
          sku: string | null;
          slug: string;
          stock_quantity: number;
          tags: string[];
          unit_label: string | null;
          updated_at: string;
          weight_grams: number | null;
        };
        Insert: {
          attributes?: Json;
          author?: string | null;
          brand?: string | null;
          category_id?: string | null;
          cost_price?: number | null;
          created_at?: string;
          description?: string | null;
          edition?: string | null;
          id?: string;
          images?: string[];
          is_active?: boolean;
          is_featured?: boolean;
          is_new_arrival?: boolean;
          isbn?: string | null;
          low_stock_threshold?: number;
          name: string;
          new_arrival_until?: string | null;
          pack_size?: number | null;
          price: number;
          publisher?: string | null;
          sale_price?: number | null;
          sales_count?: number;
          sell_unit?: string;
          sku?: string | null;
          slug: string;
          stock_quantity?: number;
          tags?: string[];
          unit_label?: string | null;
          updated_at?: string;
          weight_grams?: number | null;
        };
        Update: {
          attributes?: Json;
          author?: string | null;
          brand?: string | null;
          category_id?: string | null;
          cost_price?: number | null;
          created_at?: string;
          description?: string | null;
          edition?: string | null;
          id?: string;
          images?: string[];
          is_active?: boolean;
          is_featured?: boolean;
          is_new_arrival?: boolean;
          isbn?: string | null;
          low_stock_threshold?: number;
          name?: string;
          new_arrival_until?: string | null;
          pack_size?: number | null;
          price?: number;
          publisher?: string | null;
          sale_price?: number | null;
          sales_count?: number;
          sell_unit?: string;
          sku?: string | null;
          slug?: string;
          stock_quantity?: number;
          tags?: string[];
          unit_label?: string | null;
          updated_at?: string;
          weight_grams?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string | null;
          notification_prefs: Json;
          phone: string | null;
          school_name: string | null;
          updated_at: string;
          verified_at: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id: string;
          name?: string | null;
          notification_prefs?: Json;
          phone?: string | null;
          school_name?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          notification_prefs?: Json;
          phone?: string | null;
          school_name?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      reminders: {
        Row: {
          bundle_id: string | null;
          created_at: string;
          id: string;
          message: string | null;
          product_id: string | null;
          reminder_type: string;
          sent_at: string | null;
          trigger_date: string;
          user_id: string;
        };
        Insert: {
          bundle_id?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          product_id?: string | null;
          reminder_type: string;
          sent_at?: string | null;
          trigger_date: string;
          user_id: string;
        };
        Update: {
          bundle_id?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          product_id?: string | null;
          reminder_type?: string;
          sent_at?: string | null;
          trigger_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminders_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          is_approved: boolean;
          is_verified_purchase: boolean;
          moderated_at: string | null;
          moderated_by: string | null;
          product_id: string;
          rating: number;
          reject_reason: string | null;
          status: Database["public"]["Enums"]["review_status"];
          title: string | null;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_approved?: boolean;
          is_verified_purchase?: boolean;
          moderated_at?: string | null;
          moderated_by?: string | null;
          product_id: string;
          rating: number;
          reject_reason?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
          title?: string | null;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_approved?: boolean;
          is_verified_purchase?: boolean;
          moderated_at?: string | null;
          moderated_by?: string | null;
          product_id?: string;
          rating?: number;
          reject_reason?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
          title?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      school_bundle_items: {
        Row: {
          bundle_id: string;
          created_at: string;
          id: string;
          item_type: string;
          product_id: string;
          quantity: number;
          sort_order: number;
        };
        Insert: {
          bundle_id: string;
          created_at?: string;
          id?: string;
          item_type: string;
          product_id: string;
          quantity?: number;
          sort_order?: number;
        };
        Update: {
          bundle_id?: string;
          created_at?: string;
          id?: string;
          item_type?: string;
          product_id?: string;
          quantity?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "school_bundle_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "school_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "school_bundle_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      school_bundles: {
        Row: {
          bundle_name: string;
          class_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          school_id: string;
          total_price: number;
          updated_at: string;
        };
        Insert: {
          bundle_name: string;
          class_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          school_id: string;
          total_price?: number;
          updated_at?: string;
        };
        Update: {
          bundle_name?: string;
          class_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          school_id?: string;
          total_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_bundles_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "school_classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "school_bundles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      school_classes: {
        Row: {
          class_name: string;
          class_order: number;
          created_at: string;
          id: string;
          school_id: string;
        };
        Insert: {
          class_name: string;
          class_order?: number;
          created_at?: string;
          id?: string;
          school_id: string;
        };
        Update: {
          class_name?: string;
          class_order?: number;
          created_at?: string;
          id?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_classes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          city: string;
          created_at: string;
          id: string;
          is_featured: boolean;
          logo_url: string | null;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          city?: string;
          created_at?: string;
          id?: string;
          is_featured?: boolean;
          logo_url?: string | null;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          city?: string;
          created_at?: string;
          id?: string;
          is_featured?: boolean;
          logo_url?: string | null;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      shipping_zones: {
        Row: {
          base_rate: number;
          cities: string[];
          created_at: string;
          estimated_days: number;
          free_shipping_threshold: number | null;
          id: string;
          is_active: boolean;
          name: string;
          per_kg_rate: number;
        };
        Insert: {
          base_rate?: number;
          cities?: string[];
          created_at?: string;
          estimated_days?: number;
          free_shipping_threshold?: number | null;
          id?: string;
          is_active?: boolean;
          name: string;
          per_kg_rate?: number;
        };
        Update: {
          base_rate?: number;
          cities?: string[];
          created_at?: string;
          estimated_days?: number;
          free_shipping_threshold?: number | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          per_kg_rate?: number;
        };
        Relationships: [];
      };
      store_settings: {
        Row: {
          address: string | null;
          bank_account_number: string | null;
          bank_account_title: string | null;
          bank_iban: string | null;
          bank_instructions: string | null;
          bank_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          currency: string;
          enable_bank_transfer: boolean;
          enable_cod: boolean;
          enable_easypaisa: boolean;
          enable_jazzcash: boolean;
          home_sections: Json;
          id: boolean;
          logo_url: string | null;
          meta_description: string | null;
          meta_title: string | null;
          order_number_prefix: string;
          price_bands: Json;
          school_features_enabled: boolean;
          sender_email: string | null;
          sender_name: string | null;
          store_name: string;
          tax_rate: number;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          bank_account_number?: string | null;
          bank_account_title?: string | null;
          bank_iban?: string | null;
          bank_instructions?: string | null;
          bank_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          currency?: string;
          enable_bank_transfer?: boolean;
          enable_cod?: boolean;
          enable_easypaisa?: boolean;
          enable_jazzcash?: boolean;
          home_sections?: Json;
          id?: boolean;
          logo_url?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          order_number_prefix?: string;
          price_bands?: Json;
          school_features_enabled?: boolean;
          sender_email?: string | null;
          sender_name?: string | null;
          store_name?: string;
          tax_rate?: number;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          bank_account_number?: string | null;
          bank_account_title?: string | null;
          bank_iban?: string | null;
          bank_instructions?: string | null;
          bank_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          currency?: string;
          enable_bank_transfer?: boolean;
          enable_cod?: boolean;
          enable_easypaisa?: boolean;
          enable_jazzcash?: boolean;
          home_sections?: Json;
          id?: boolean;
          logo_url?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          order_number_prefix?: string;
          price_bands?: Json;
          school_features_enabled?: boolean;
          sender_email?: string | null;
          sender_name?: string | null;
          store_name?: string;
          tax_rate?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      wishlist: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wishlist_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _catalog_attr_match: {
        Args: {
          attrs: Json;
          except_key: string;
          filters: Json;
          prod: Database["public"]["Tables"]["products"]["Row"];
        };
        Returns: boolean;
      };
      _catalog_axis_match: {
        Args: {
          attrs: Json;
          except_key: string;
          filters: Json;
          p_product_id: string;
        };
        Returns: boolean;
      };
      _compute_order: {
        Args: {
          p_city: string;
          p_coupon_code: string;
          p_items: Json;
          p_payment_method: string;
        };
        Returns: Json;
      };
      _restock_order: { Args: { p_order_id: string }; Returns: boolean };
      attach_payment_proof: {
        Args: { p_order_id: string; p_path: string };
        Returns: Json;
      };
      attribute_option_usage: {
        Args: { p_key: string };
        Returns: {
          products: number;
          value: string;
          variants: number;
        }[];
      };
      cancel_my_order: { Args: { p_order_id: string }; Returns: Json };
      cart_lines: { Args: { p_items: Json }; Returns: Json };
      catalog_search: { Args: { p: Json }; Returns: Json };
      category_ancestors: {
        Args: { p_category_id: string };
        Returns: {
          depth: number;
          id: string;
        }[];
      };
      category_attribute_set: {
        Args: { p_category_id: string };
        Returns: {
          attribute_id: string;
          inherited: boolean;
          is_required: boolean;
          is_variant_axis: boolean;
          key: string;
          sort_order: number;
        }[];
      };
      category_descendants: {
        Args: { p_category_id: string };
        Returns: string[];
      };
      category_product_ids: {
        Args: { p_category_id: string };
        Returns: string[];
      };
      get_low_stock_products: {
        Args: { p_limit?: number };
        Returns: {
          category_name: string;
          id: string;
          low_stock_threshold: number;
          name: string;
          price: number;
          stock_quantity: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      i_have_delivered_product: {
        Args: { _product_id: string };
        Returns: boolean;
      };
      place_order: {
        Args: {
          p_coupon_code?: string;
          p_items: Json;
          p_notes?: string;
          p_payment_method: string;
          p_shipping_address: Json;
        };
        Returns: Json;
      };
      product_effective_price: {
        Args: { p: Database["public"]["Tables"]["products"]["Row"] };
        Returns: number;
      };
      quote_order: {
        Args: {
          p_city?: string;
          p_coupon_code?: string;
          p_items: Json;
          p_payment_method?: string;
        };
        Returns: Json;
      };
      refresh_product_sales_counts: {
        Args: { p_product_ids?: string[] };
        Returns: number;
      };
      user_has_delivered_product: {
        Args: { _product_id: string; _user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "customer" | "manager" | "admin";
      banner_position: "hero" | "section" | "sidebar";
      coupon_type: "percentage" | "fixed" | "free_shipping";
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded";
      payment_method: "cod" | "jazzcash" | "easypaisa" | "stripe" | "bank_transfer";
      payment_status: "pending" | "pending_verification" | "paid" | "failed" | "refunded";
      review_status: "pending" | "approved" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["customer", "manager", "admin"],
      banner_position: ["hero", "section", "sidebar"],
      coupon_type: ["percentage", "fixed", "free_shipping"],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      payment_method: ["cod", "jazzcash", "easypaisa", "stripe", "bank_transfer"],
      payment_status: ["pending", "pending_verification", "paid", "failed", "refunded"],
      review_status: ["pending", "approved", "rejected"],
    },
  },
} as const;

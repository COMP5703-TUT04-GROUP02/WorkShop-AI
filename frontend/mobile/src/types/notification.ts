export type Notification = {
  id: number;
  user_id: number;
  title: string;
  content: string;
  template_key?: string | null;
  template_params?: Record<string, string | number> | null;
  notification_type: string;
  related_type: string;
  related_id: number;
  read_at: string | null;
  created_at: string;
  related_data?: unknown;
};

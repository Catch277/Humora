export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
}

export interface PaginatedNotifications {
  data: Notification[];
  total: number;
  page: number;
  page_size: number;
}

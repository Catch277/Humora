export interface NotificationSetting {
  id: string;
  user_id: string;
  channel: string;
  enabled: boolean;
  updated_at: string;
}

export interface UpdateNotificationSettingInput {
  channel: string;
  enabled: boolean;
}

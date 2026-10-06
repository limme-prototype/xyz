export interface VideoMeta {
  id: string;
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  duration: string;
  description: string;
  views?: string;
  uploadedAt?: string;
}

export interface PlayerHistoryItem {
  id: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  playedAt: number;
}

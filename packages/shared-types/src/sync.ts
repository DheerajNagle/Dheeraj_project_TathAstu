export type SyncActionType = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncEntity = 'ORDER' | 'KOT' | 'MENU_ITEM' | 'CATEGORY';

export interface SyncLogEntry {
  id: string;
  entityType: SyncEntity;
  entityId: string;
  action: SyncActionType;
  payload: any;
  createdAt: string | Date;
}

export interface SyncPayload {
  posId: string;
  lastSyncedAt?: string | Date;
  logs: SyncLogEntry[];
}

export interface SyncError {
  entityId: string;
  entityType: SyncEntity;
  error: string;
}

export interface SyncResponse {
  success: boolean;
  syncedAt: string | Date;
  errors: SyncError[];
}

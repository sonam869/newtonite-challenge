// Work Item types
export type WorkItemStatus = 'open' | 'in_progress' | 'pending_approval' | 'resolved' | 'closed';
export type WorkItemPriority = 'critical' | 'high' | 'medium' | 'low';
export type WorkItemType = 'incident' | 'task' | 'compliance' | 'approval' | 'investigation';

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  type: WorkItemType;
  createdById: string;
  assignedToId: string | null;
  teamId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  createdByName?: string;
  assignedToName?: string;
  teamName?: string;
}

// Audit Event types
export type EventType =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'unassigned'
  | 'commented'
  | 'title_changed'
  | 'description_changed'
  | 'team_changed';

export interface AuditEvent {
  id: string;
  workItemId: string;
  actorId: string;
  actorName: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

// Comment types
export interface Comment {
  id: string;
  workItemId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

// User types
export type GlobalRole = 'admin' | 'user';
export type TeamRole = 'lead' | 'member' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  globalRole: GlobalRole;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  teamId: string;
  role: TeamRole;
  userName?: string;
  userEmail?: string;
}

// API response wrappers
export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Workflow: valid status transitions
export const VALID_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['open', 'pending_approval', 'resolved', 'closed'],
  pending_approval: ['in_progress', 'resolved', 'closed'],
  resolved: ['open', 'closed'],
  closed: ['open'],
};

// Socket.io event names
export const SOCKET_EVENTS = {
  WORK_ITEM_UPDATED: 'work_item:updated',
  WORK_ITEM_CREATED: 'work_item:created',
  COMMENT_ADDED: 'comment:added',
  EVENT_ADDED: 'event:added',
} as const;

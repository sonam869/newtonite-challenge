"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOCKET_EVENTS = exports.VALID_TRANSITIONS = void 0;
// Workflow: valid status transitions
exports.VALID_TRANSITIONS = {
    open: ['in_progress', 'closed'],
    in_progress: ['open', 'pending_approval', 'resolved', 'closed'],
    pending_approval: ['in_progress', 'resolved', 'closed'],
    resolved: ['open', 'closed'],
    closed: ['open'],
};
// Socket.io event names
exports.SOCKET_EVENTS = {
    WORK_ITEM_UPDATED: 'work_item:updated',
    WORK_ITEM_CREATED: 'work_item:created',
    COMMENT_ADDED: 'comment:added',
    EVENT_ADDED: 'event:added',
};

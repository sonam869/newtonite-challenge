'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let globalSocket: Socket | null = null;

export function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(SOCKET_URL, {
      autoConnect: true,
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return globalSocket;
}

export function useRealtimeSubscription(
  eventName: string,
  callback: (payload: any) => void,
  workItemId?: string
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const socket = getSocket();

    if (workItemId) {
      socket.emit('join:work-item', workItemId);
    }

    const handler = (data: any) => {
      cbRef.current(data);
    };

    socket.on(eventName, handler);

    return () => {
      socket.off(eventName, handler);
      if (workItemId) {
        socket.emit('leave:work-item', workItemId);
      }
    };
  }, [eventName, workItemId]);
}

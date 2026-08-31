import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import ApiClient from '../api/client';

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map()); // eventName -> Set of callbacks
  const reconnectTimeoutRef = useRef(null);

  const subscribe = useCallback((eventType, callback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType).add(callback);

    return () => {
      if (listenersRef.current.has(eventType)) {
        listenersRef.current.get(eventType).delete(callback);
      }
    };
  }, []);

  const emit = useCallback((type, payload = {}) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const connect = useCallback(() => {
    if (!isAuthenticated) return;

    const token = ApiClient.getToken();
    if (!token) return;

    // Close previous socket if any
    if (socketRef.current) {
      socketRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/conversations?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('[WebSocket] Connected successfully to real-time events hub');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent(data);

          const eventType = data.type || data.event || 'message';
          const handlers = listenersRef.current.get(eventType);
          if (handlers) {
            handlers.forEach((fn) => fn(data.payload || data));
          }

          // Global wildcard listener
          const allHandlers = listenersRef.current.get('*');
          if (allHandlers) {
            allHandlers.forEach((fn) => fn(data));
          }
        } catch (e) {
          console.warn('[WebSocket] Error parsing incoming message:', e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Attempt reconnect after 3 seconds if still authenticated
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (ApiClient.getToken()) {
            connect();
          }
        }, 3000);
      };

      ws.onerror = (err) => {
        console.warn('[WebSocket] Connection error:', err);
        ws.close();
      };
    } catch (err) {
      console.warn('[WebSocket] Failed to instantiate WebSocket:', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      if (socketRef.current) {
        socketRef.current.close();
      }
      setConnected(false);
    }

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [isAuthenticated, connect]);

  return (
    <WebSocketContext.Provider
      value={{
        connected,
        lastEvent,
        subscribe,
        emit,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
export default WebSocketContext;

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  buildUserWebSocketUrl,
  getCustomerChatRooms,
  getProviderChatRooms,
} from "../api/chat";
import { getAccessToken } from "../api/client";
import { getNotificationSummary } from "../api/notifications";
import { useAuth } from "./AuthContext";

export type RealtimeEvent = Record<string, unknown>;

type RealtimeListener = (event: RealtimeEvent) => void;

type RealtimeContextValue = {
  isConnected: boolean;
  chatUnreadCount: number;
  notificationUnreadCount: number;
  /** Bookings that changed since the customer or provider last looked. */
  bookingUpdateCount: number;
  markChatRoomRead: (chatRoomId: number) => void;
  markBookingUpdatesSeen: () => void;
  refreshUnreadCounts: () => Promise<void>;
  subscribe: (listener: RealtimeListener) => () => void;
};

/**
 * A new booking and every status change already arrive as a system message in
 * the booking's chat room, so the badge counts those rather than asking the
 * server for anything new. Counting distinct bookings, not messages: three
 * updates to one job is one job wanting attention.
 */
const BOOKING_EVENT_TYPES = new Set(["booking_created", "booking_status"]);

const BACKGROUND_DISCONNECT_DELAY_MS = 30000;


/**
 * True when an event says a booking was created or changed state.
 *
 * Both arrive as a system message in that booking's chat room, which is the
 * only push the server already makes for bookings — so a screen that wants to
 * stay current listens for these rather than asking again on a timer.
 */
export function getBookingEventId(event: RealtimeEvent): number | null {
  if (event.type !== "chat_message") return null;
  const message = event.chat_message as
    | { message_type?: unknown; related_id?: unknown }
    | undefined;
  const kind = typeof message?.message_type === "string" ? message.message_type : "";
  if (!BOOKING_EVENT_TYPES.has(kind)) return null;
  return typeof message?.related_id === "number" ? message.related_id : null;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const websocketRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backgroundDisconnectTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<Set<RealtimeListener>>(new Set());
  const [chatUnreadByRoom, setChatUnreadByRoom] = useState<Record<number, number>>(
    {},
  );
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [updatedBookingIds, setUpdatedBookingIds] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const refreshUnreadCounts = useCallback(async () => {
    if (!user) {
      setChatUnreadByRoom({});
      setNotificationUnreadCount(0);
      setUpdatedBookingIds([]);
      return;
    }

    try {
      const [chatRooms, notificationSummary] = await Promise.all([
        user.role === "customer"
          ? getCustomerChatRooms()
          : user.role === "provider"
            ? getProviderChatRooms()
            : Promise.resolve(null),
        getNotificationSummary(),
      ]);

      const nextUnreadByRoom: Record<number, number> = {};
      for (const room of chatRooms?.items ?? []) {
        nextUnreadByRoom[room.id] = Math.max(room.unread_count ?? 0, 0);
      }
      setChatUnreadByRoom(nextUnreadByRoom);
      setNotificationUnreadCount(
        Math.max(notificationSummary?.unread_count ?? 0, 0),
      );
    } catch {
      // Badges are supplementary UI; the chat and notification screens still load normally.
    }
  }, [user]);

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const clearBackgroundDisconnectTimer = useCallback(() => {
    if (backgroundDisconnectTimerRef.current) {
      clearTimeout(backgroundDisconnectTimerRef.current);
      backgroundDisconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearPingTimer();
    clearBackgroundDisconnectTimer();

    const websocket = websocketRef.current;
    websocketRef.current = null;
    setIsConnected(false);

    if (websocket) {
      websocket.close();
    }
  }, [clearBackgroundDisconnectTimer, clearPingTimer]);

  const connect = useCallback(() => {
    if (!user || AppState.currentState !== "active") {
      return;
    }

    const existingWebsocket = websocketRef.current;
    if (
      existingWebsocket &&
      (existingWebsocket.readyState === WebSocket.CONNECTING ||
        existingWebsocket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    const websocket = new WebSocket(buildUserWebSocketUrl());
    websocketRef.current = websocket;

    websocket.onopen = () => {
      websocket.send(JSON.stringify({ type: "auth", token }));
      setIsConnected(true);
      clearPingTimer();
      pingTimerRef.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    websocket.onmessage = (event) => {
      const data = parseRealtimeEvent(event.data);
      if (!data) {
        return;
      }

      if (data.type === "chat_message" && typeof data.chat_room_id === "number") {
        const chatMessage = data.chat_message;
        const senderId =
          chatMessage && typeof chatMessage === "object" &&
          typeof (chatMessage as { sender_id?: unknown }).sender_id === "number"
            ? (chatMessage as { sender_id: number }).sender_id
            : null;
        const serverUnreadCount =
          typeof data.unread_count === "number" ? data.unread_count : null;

        setChatUnreadByRoom((current) => {
          const currentCount = current[data.chat_room_id as number] ?? 0;
          const nextCount =
            serverUnreadCount != null
              ? serverUnreadCount
              : senderId != null && senderId !== user?.id
                ? currentCount + 1
                : currentCount;

          return {
            ...current,
            [data.chat_room_id as number]: Math.max(nextCount, 0),
          };
        });
      }

      if (data.type === "chat_message") {
        const message = data.chat_message as
          | { message_type?: unknown; related_id?: unknown; sender_id?: unknown }
          | undefined;
        const kind = typeof message?.message_type === "string" ? message.message_type : "";
        const bookingId = typeof message?.related_id === "number" ? message.related_id : null;
        const from = typeof message?.sender_id === "number" ? message.sender_id : null;

        if (BOOKING_EVENT_TYPES.has(kind) && bookingId != null && from !== user?.id) {
          setUpdatedBookingIds((current) =>
            current.includes(bookingId) ? current : [...current, bookingId],
          );
        }
      }

      if (data.type === "notification_delivery") {
        if (typeof data.unread_count === "number") {
          setNotificationUnreadCount(Math.max(data.unread_count, 0));
        } else {
          setNotificationUnreadCount((current) => current + 1);
        }
      }

      for (const listener of Array.from(listenersRef.current)) {
        listener(data);
      }
    };

    websocket.onerror = () => {
      setIsConnected(false);
    };

    websocket.onclose = () => {
      if (websocketRef.current === websocket) {
        websocketRef.current = null;
      }
      clearPingTimer();
      setIsConnected(false);
    };
  }, [clearPingTimer, user]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    void refreshUnreadCounts();

    const refreshTimer = setInterval(() => {
      void refreshUnreadCounts();
    }, 30000);

    return () => {
      clearInterval(refreshTimer);
    };
  }, [refreshUnreadCounts]);

  useEffect(() => {
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === "active") {
        clearBackgroundDisconnectTimer();
        connect();
        return;
      }

      clearBackgroundDisconnectTimer();
      backgroundDisconnectTimerRef.current = setTimeout(() => {
        disconnect();
      }, BACKGROUND_DISCONNECT_DELAY_MS);
    }

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
      clearBackgroundDisconnectTimer();
    };
  }, [clearBackgroundDisconnectTimer, connect, disconnect]);

  const subscribe = useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener);

    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const markChatRoomRead = useCallback((chatRoomId: number) => {
    setChatUnreadByRoom((current) => ({
      ...current,
      [chatRoomId]: 0,
    }));
  }, []);

  const chatUnreadCount = Object.values(chatUnreadByRoom).reduce(
    (total, count) => total + count,
    0,
  );

  const markBookingUpdatesSeen = useCallback(() => {
    setUpdatedBookingIds((current) => (current.length ? [] : current));
  }, []);

  const bookingUpdateCount = updatedBookingIds.length;

  const value = useMemo(
    () => ({
      bookingUpdateCount,
      chatUnreadCount,
      isConnected,
      markBookingUpdatesSeen,
      markChatRoomRead,
      notificationUnreadCount,
      refreshUnreadCounts,
      subscribe,
    }),
    [
      bookingUpdateCount,
      chatUnreadCount,
      isConnected,
      markBookingUpdatesSeen,
      markChatRoomRead,
      notificationUnreadCount,
      refreshUnreadCounts,
      subscribe,
    ],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);

  if (!context) {
    throw new Error("useRealtime must be used inside RealtimeProvider");
  }

  return context;
}

function parseRealtimeEvent(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const data = JSON.parse(value);
    return data && typeof data === "object"
      ? (data as RealtimeEvent)
      : null;
  } catch {
    return null;
  }
}

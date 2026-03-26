import io from "socket.io-client";
import { BASE_URL } from "./constants";

let socketInstance = null;

export const createSocketConnection = () => {
  // Reuse existing socket while connected or reconnecting.
  if (socketInstance && (socketInstance.connected || socketInstance.active)) {
    return socketInstance;
  }

  const options = {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    transports: ["websocket", "polling"],
    withCredentials: true,
  };

  if (location.hostname === "localhost") {
    socketInstance = io(BASE_URL, options);
  } else {
    socketInstance = io("/", { ...options, path: "/api/socket.io" });
  }

  const socket = socketInstance;

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connect error:", error.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);

    // Keep instance for auto-reconnect on transient failures.
    // Clear only if this exact socket was intentionally disconnected.
    if (reason === "io client disconnect" && socketInstance === socket) {
      socketInstance = null;
    }
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
};

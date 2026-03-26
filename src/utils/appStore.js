import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./userSlice";
import feedReducer from "./feedSlice";
import connectionReducer from "./conectionSlice";
import requestReducer from "./requestSlice";
import notificationReducer from "./notificationSlice";
import onlineUsersReducer from "./onlineUsersSlice";
import callReducer from "./callSlice";

const appStore = configureStore({
  reducer: {
    user: userReducer,
    feed: feedReducer,
    connections: connectionReducer,
    requests: requestReducer,
    notification: notificationReducer,
    onlineUsers: onlineUsersReducer,
    call: callReducer,
  },
});

export default appStore;

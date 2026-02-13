import { createSlice } from "@reduxjs/toolkit";

const notificationSlice = createSlice({
  name: "notification",
  initialState: {
    hasNewRequests: false,
    unreadMessages: {}, // { userId: true/false }
  },
  reducers: {
    setHasNewRequests: (state, action) => {
      state.hasNewRequests = action.payload;
    },
    setUnreadMessage: (state, action) => {
      const { userId, unread } = action.payload;
      state.unreadMessages[userId] = unread;
    },
    clearNewRequests: (state) => {
      state.hasNewRequests = false;
    },
    clearUnreadMessages: (state, action) => {
      const userId = action.payload;
      state.unreadMessages[userId] = false;
    },
    clearAllUnreadMessages: (state) => {
      state.unreadMessages = {};
    },
  },
});

export const { setHasNewRequests, setUnreadMessage, clearNewRequests, clearUnreadMessages, clearAllUnreadMessages } = notificationSlice.actions;
export default notificationSlice.reducer;

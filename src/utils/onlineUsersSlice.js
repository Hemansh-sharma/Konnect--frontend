import { createSlice } from "@reduxjs/toolkit";

const onlineUsersSlice = createSlice({
  name: "onlineUsers",
  initialState: {
    users: {}, // { userId: true }
  },
  reducers: {
    addOnlineUser: (state, action) => {
      state.users[action.payload] = true;
    },
    removeOnlineUser: (state, action) => {
      delete state.users[action.payload];
    },
    setOnlineUsers: (state, action) => {
      state.users = action.payload;
    },
  },
});

export const { addOnlineUser, removeOnlineUser, setOnlineUsers } = onlineUsersSlice.actions;
export default onlineUsersSlice.reducer;

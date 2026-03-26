import { createSlice } from "@reduxjs/toolkit";

const callSlice = createSlice({
  name: "call",
  initialState: {
    incomingCall: null, // { from, fromId, fromName, type: 'audio' | 'video', groupChatId? }
    outgoingCall: null, // { to, toId, toName, type: 'audio' | 'video', groupChatId? }
    activeCall: null, // { with, withId, withName, type, groupChatId?, startTime }
    callStatus: "idle", // idle, ringing, connecting, connected, ended
    // Note: remoteStream and localStream removed - MediaStream is not serializable
    // Store streams in component state or refs instead
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: false,
  },
  reducers: {
    setIncomingCall: (state, action) => {
      state.incomingCall = action.payload;
      state.callStatus = "ringing";
    },
    setOutgoingCall: (state, action) => {
      state.outgoingCall = action.payload;
      state.callStatus = "ringing";
    },
    setActiveCall: (state, action) => {
      state.activeCall = action.payload;
      state.incomingCall = null;
      state.outgoingCall = null;
      state.callStatus = "connected";
    },
    setCallStatus: (state, action) => {
      state.callStatus = action.payload;
    },
    toggleAudio: (state) => {
      state.isAudioEnabled = !state.isAudioEnabled;
    },
    toggleVideo: (state) => {
      state.isVideoEnabled = !state.isVideoEnabled;
    },
    toggleScreenShare: (state) => {
      state.isScreenSharing = !state.isScreenSharing;
    },
    setScreenSharing: (state, action) => {
      state.isScreenSharing = action.payload;
    },
    endCall: (state) => {
      state.incomingCall = null;
      state.outgoingCall = null;
      state.activeCall = null;
      state.callStatus = "idle";
      state.isAudioEnabled = true;
      state.isVideoEnabled = true;
      state.isScreenSharing = false;
    },
    rejectCall: (state) => {
      state.incomingCall = null;
      state.callStatus = "idle";
    },
  },
});

export const {
  setIncomingCall,
  setOutgoingCall,
  setActiveCall,
  setCallStatus,
  toggleAudio,
  toggleVideo,
  toggleScreenShare,
  setScreenSharing,
  endCall,
  rejectCall,
} = callSlice.actions;

export default callSlice.reducer;

import { Outlet, useNavigate } from "react-router-dom";
import NavBar from "./NavBar";
import Footer from "./Footer";
import IncomingCallModal from "./IncomingCallModal";
import VideoCall from "./VideoCall";
import GroupVideoCall from "./GroupVideoCall";
import axios from "axios";
import { BASE_URL } from "../utils/constants";
import { useDispatch, useSelector } from "react-redux";
import { addUser, removeUser } from "../utils/userSlice";
import { setHasNewRequests, setUnreadMessage } from "../utils/notificationSlice";
import { addOnlineUser, removeOnlineUser, setOnlineUsers } from "../utils/onlineUsersSlice";
import { createSocketConnection, disconnectSocket } from "../utils/socket";
import { setIncomingCall, setActiveCall, rejectCall, setCallStatus, endCall } from "../utils/callSlice";
import { useEffect, useRef } from "react";

const Body = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const userData = useSelector((store) => store.user);
  const call = useSelector((store) => store.call);
  const socketRef = useRef(null);

  const fetchUser = async () => {
    if (userData) return;
    try {
      const res = await axios.get(BASE_URL + "/profile/view", {
        withCredentials: true,
      });
      dispatch(addUser(res.data));
    } catch (err) {
      if (err?.response?.status === 401) {
        // Session expired or missing cookie: clear stale user state and redirect.
        dispatch(removeUser());
        disconnectSocket();
        navigate("/login", { replace: true });
        return;
      }
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (!userData || !userData._id) {
      return;
    }

    try {
      const socket = createSocketConnection();
      socketRef.current = socket;

      const emitUserOnline = () => {
        console.log("Emitting userOnline event for user:", userData._id);
        socket.emit("userOnline", { userId: userData._id });
      };

      // Emit immediately and on every reconnect.
      emitUserOnline();
      socket.on("connect", emitUserOnline);

      // Listen for initial list of online users
      socket.on("onlineUsersList", ({ users }) => {
        console.log("Received online users list:", users);
        const usersObj = {};
        users.forEach(userId => {
          usersObj[userId] = true;
        });
        dispatch(setOnlineUsers(usersObj));
      });

      // Listen for new connection requests
      socket.on("newRequest", () => {
        console.log("New request notification received");
        dispatch(setHasNewRequests(true));
      });

      // Listen for new messages with senderId
      socket.on("newMessage", ({ senderId }) => {
        console.log("New message from user:", senderId);
        dispatch(setUnreadMessage({ userId: senderId, unread: true }));
      });

      // Listen for user coming online
      socket.on("userOnline", ({ userId }) => {
        console.log("Socket event - User online:", userId);
        dispatch(addOnlineUser(userId));
      });

      // Listen for user going offline
      socket.on("userOffline", ({ userId }) => {
        console.log("Socket event - User offline:", userId);
        dispatch(removeOnlineUser(userId));
      });

      // Listen for incoming calls - GLOBAL HANDLER
      socket.on("incomingCall", ({ from, fromName, callType }) => {
        console.log("Incoming call from:", fromName, "type:", callType);
        dispatch(
          setIncomingCall({
            from,
            fromId: from,
            fromName,
            type: callType,
          })
        );
      });

      // Listen for call acceptance
      // Note: The actual WebRTC peer creation on callAccepted is handled
      // inside VideoCall.jsx's socket listener, not here.
      socket.on("callAccepted", ({ from }) => {
        console.log("Call accepted by:", from);
        // callStatus is already set by setActiveCall, no-op here
      });

      // Listen for call rejection
      socket.on("callRejected", () => {
        console.log("Call rejected");
        dispatch(rejectCall());
      });

      // Listen for call ended
      socket.on("callEnded", ({ from }) => {
        console.log("Call ended by:", from);
        dispatch(endCall());
      });

      // Listen for user offline during call
      socket.on("userOfflineForCall", ({ message }) => {
        console.log("User offline for call:", message);
        alert(message);
        dispatch(endCall());
      });

      // Listen for group call started - GLOBAL HANDLER
      socket.on("groupCallStarted", ({ initiatorId, initiatorName, callType, groupChatId }) => {
        if (initiatorId?.toString() === userData?._id?.toString()) {
          return;
        }

        console.log("Group call started by:", initiatorName, "in group:", groupChatId);
        dispatch(
          setIncomingCall({
            from: initiatorId,
            fromId: initiatorId,
            fromName: initiatorName,
            type: callType,
            groupChatId: groupChatId,
          })
        );
        dispatch(setCallStatus("ringing"));
      });

      // Listen for group call ended
      socket.on("groupCallEnded", ({ endedBy }) => {
        console.log("Group call ended by:", endedBy);
        dispatch(endCall());
      });

      return () => {
        socket.off("connect", emitUserOnline);
        disconnectSocket();
      };
    } catch (error) {
      console.error("Socket connection error:", error);
      return;
    }
  }, [userData, dispatch]);

  // Handle accepting incoming call
  const handleAcceptCall = () => {
    console.log("handleAcceptCall called", call.incomingCall);
    if (!call.incomingCall || !socketRef.current || !userData) {
      console.warn("Cannot accept call: missing incomingCall, socket, or userData");
      return;
    }

    // Handle group call differently - navigate to group chat
    if (call.incomingCall.groupChatId) {
      dispatch(
        setActiveCall({
          with: call.incomingCall.fromName,
          groupChatId: call.incomingCall.groupChatId,
          type: call.incomingCall.type,
        })
      );
      dispatch(setCallStatus("connected"));
      // Navigate to group chat
      navigate(`/group-chat/${call.incomingCall.groupChatId}`);
    } else {
      // Handle 1-on-1 call
      console.log("Accepting 1-on-1 call from", call.incomingCall.from, "with userId", userData._id);
      socketRef.current.emit("acceptCall", {
        from: userData._id,
        to: call.incomingCall.from,
      });

      dispatch(
        setActiveCall({
          with: call.incomingCall.fromName,
          withId: call.incomingCall.from,
          withName: call.incomingCall.fromName,
          type: call.incomingCall.type,
          isInitiator: false,
        })
      );
      console.log("Dispatched setActiveCall with isInitiator: false");
    }
  };

  // Handle rejecting incoming call
  const handleRejectCall = () => {
    if (!call.incomingCall || !socketRef.current || !userData) return;

    socketRef.current.emit("rejectCall", {
      from: userData._id,
      to: call.incomingCall.from,
    });

    dispatch(rejectCall());
  };

  // Handle call end
  const handleCallEnd = () => {
    dispatch(endCall());
  };

  // Debug: Log render conditions
  const shouldRenderReceiverVideo = call.activeCall && !call.activeCall.groupChatId && !call.activeCall.isInitiator;
  const shouldRenderGroupVideo = call.activeCall?.groupChatId;
  
  useEffect(() => {
    if (call.activeCall) {
      console.log("[BODY] Call state:", {
        activeCall: call.activeCall,
        isInitiator: call.activeCall.isInitiator,
        groupChatId: call.activeCall.groupChatId,
        shouldRenderReceiverVideo: shouldRenderReceiverVideo,
        shouldRenderGroupVideo: shouldRenderGroupVideo,
      });
    }
  }, [call.activeCall]);

  return (
    <div>
      <NavBar />
      <Outlet />
      <Footer />
      <IncomingCallModal onAccept={handleAcceptCall} onReject={handleRejectCall} />
      {shouldRenderReceiverVideo && (
        <VideoCall
          targetUserId={call.activeCall.withId}
          targetName={call.activeCall.withName}
          isInitiator={false}
          onCallEnd={handleCallEnd}
        />
      )}
      {call.activeCall?.groupChatId && (
        <GroupVideoCall
          groupChatId={call.activeCall.groupChatId}
          groupName={call.activeCall.with}
          participants={[]}
          onCallEnd={handleCallEnd}
        />
      )}
    </div>
  );
};
export default Body;

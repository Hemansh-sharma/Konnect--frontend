import { Outlet, useNavigate } from "react-router-dom";
import NavBar from "./NavBar";
import Footer from "./Footer";
import axios from "axios";
import { BASE_URL } from "../utils/constants";
import { useDispatch, useSelector } from "react-redux";
import { addUser } from "../utils/userSlice";
import { setHasNewRequests, setUnreadMessage } from "../utils/notificationSlice";
import { addOnlineUser, removeOnlineUser, setOnlineUsers } from "../utils/onlineUsersSlice";
import { createSocketConnection } from "../utils/socket";
import { useEffect } from "react";

const Body = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const userData = useSelector((store) => store.user);

  const fetchUser = async () => {
    if (userData) return;
    try {
      const res = await axios.get(BASE_URL + "/profile/view", {
        withCredentials: true,
      });
      dispatch(addUser(res.data));
    } catch (err) {
      if (err.status === 401) {
        navigate("/login");
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

      // Emit event to notify backend that this user is online
      console.log("Emitting userOnline event for user:", userData._id);
      socket.emit("userOnline", { userId: userData._id });

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

      return () => {
        socket.disconnect();
      };
    } catch (error) {
      console.error("Socket connection error:", error);
      return;
    }
  }, [userData, dispatch]);

  return (
    <div>
      <NavBar />
      <Outlet />
      <Footer />
    </div>
  );
};
export default Body;

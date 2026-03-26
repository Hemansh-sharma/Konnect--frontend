import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { createSocketConnection } from "../utils/socket";
import { useSelector, useDispatch } from "react-redux";
import axios from "axios";
import { BASE_URL } from "../utils/constants";
import VideoCall from "./VideoCall";
import {
  setActiveCall,
  rejectCall,
  setCallStatus,
} from "../utils/callSlice";

const Chat = () => {
  const { targetUserId } = useParams();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [targetUserName, setTargetUserName] = useState("");
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const user = useSelector((store) => store.user);
  const call = useSelector((store) => store.call);
  const dispatch = useDispatch();
  const userId = user?._id;
  const socketRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const fetchChatMessages = async () => {
    try {
      const chat = await axios.get(BASE_URL + "/chat/" + targetUserId, {
        withCredentials: true,
      });

      console.log(chat.data.messages);

      const chatMessages = chat?.data?.messages.map((msg) => {
        const { senderId, text, imageUrl, createdAt } = msg;
        return {
          firstName: senderId?.firstName,
          lastName: senderId?.lastName,
          text,
          imageUrl,
          timestamp: createdAt,
        };
      });
      setMessages(chatMessages);

      // Get target user name
      if (chat.data.messages.length > 0) {
        const firstMessage = chat.data.messages[0];
        const targetName = `${firstMessage.senderId?.firstName} ${firstMessage.senderId?.lastName}`;
        setTargetUserName(targetName);
      } else {
        // If no messages, try to get user info from another source
        setTargetUserName("User");
      }
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      setMessages([]);
      setTargetUserName("User");
    }
  };
  
  useEffect(() => {
    fetchChatMessages();
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const socket = createSocketConnection();
    socketRef.current = socket;

    // As soon as the page loaded, the socket connection is made and joinChat event is emitted
    socket.emit("joinChat", {
      firstName: user.firstName,
      userId,
      targetUserId,
    });

    socket.on("messageReceived", ({ firstName, lastName, text, imageUrl }) => {
      console.log(firstName + " :  " + (text || "sent an image"));
      setMessages((messages) => [...messages, { firstName, lastName, text, imageUrl, timestamp: new Date().toISOString() }]);
    });

    return () => {
      socket.off("messageReceived");
    };
  }, [userId, targetUserId, dispatch, user.firstName]);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async () => {
    if (!selectedImage) return null;

    setUploading(true);
    const formData = new FormData();
    formData.append("image", selectedImage);

    try {
      const response = await axios.post(BASE_URL + "/chat/upload", formData, {
        withCredentials: true,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setUploading(false);
      return response.data.imageUrl;
    } catch (error) {
      console.error("Image upload failed:", error);
      setUploading(false);
      return null;
    }
  };

  const sendMessage = async () => {
    const socket = createSocketConnection();
    
    let imageUrl = null;
    if (selectedImage) {
      imageUrl = await uploadImage();
      if (!imageUrl) {
        alert("Failed to upload image");
        return;
      }
    }

    if (!newMessage && !imageUrl) {
      return; // Don't send empty messages
    }

    socket.emit("sendMessage", {
      firstName: user.firstName,
      lastName: user.lastName,
      userId,
      targetUserId,
      text: newMessage,
      imageUrl,
    });
    
    setNewMessage("");
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const clearImagePreview = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const startVideoCall = () => {
    socketRef.current?.emit("startCall", {
      from: userId,
      fromName: `${user.firstName} ${user.lastName}`,
      to: targetUserId,
      callType: "video",
    });
    dispatch(
      setActiveCall({
        with: targetUserName,
        withId: targetUserId,
        withName: targetUserName,
        type: "video",
        isInitiator: true,
      })
    );
  };

  // Note: Incoming call handling is now done globally in Body.jsx
  // The IncomingCallModal is also rendered globally in Body.jsx
  // We only need to handle the case when user accepts a call from the chat page

  const handleCallEnd = () => {
    // Call end is handled by VideoCall component
  };

  return (
    <>
      {call.activeCall && !call.activeCall.groupChatId && call.activeCall.isInitiator && (
        <VideoCall
          targetUserId={targetUserId}
          targetName={targetUserName}
          isInitiator={call.activeCall.isInitiator}
          onCallEnd={handleCallEnd}
        />
      )}
      <div className="w-3/4 mx-auto border-2 border-purple-300 m-5 h-[70vh] flex flex-col rounded-lg shadow-xl bg-white">
        <div className="p-5 border-b-2 border-purple-300 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-t-lg font-bold flex justify-between items-center">
          <h1>Chat</h1>
          <button
            onClick={startVideoCall}
            className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none"
            title="Start video call"
          >
            📹 Video Call
          </button>
        </div>
        <div className="flex-1 overflow-scroll p-5 bg-gray-50">
          {messages.map((msg, index) => {
            return (
              <div
                key={index}
                className={
                  "chat " +
                  (user.firstName === msg.firstName ? "chat-end" : "chat-start")
                }
              >
                <div className="chat-header font-bold text-gray-800">
                  {`${msg.firstName}  ${msg.lastName}`}
                  <time className="text-xs font-semibold text-gray-600">{formatTime(msg.timestamp)}</time>
                </div>
                {msg.text && <div className="chat-bubble">{msg.text}</div>}
                {msg.imageUrl && (
                  <div className="chat-bubble">
                    <img 
                      src={BASE_URL + msg.imageUrl} 
                      alt="chat" 
                      className="max-w-xs h-auto rounded-lg"
                    />
                  </div>
                )}
                <div className="chat-footer font-semibold text-gray-600">Sent</div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-5 border-t-2 border-purple-300 bg-white rounded-b-lg">
          {imagePreview && (
            <div className="mb-4 relative">
              <img 
                src={imagePreview} 
                alt="preview" 
                className="max-h-32 max-w-xs rounded-lg"
              />
              <button
                onClick={clearImagePreview}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 border-2 border-purple-300 focus:border-pink-400 focus:outline-none rounded px-4 py-2 text-black placeholder-gray-500 bg-gray-100"
              placeholder="Type a message..."
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-none"
              title="Upload image"
            >
              📷
            </button>
            <button 
              onClick={sendMessage} 
              disabled={uploading}
              className="btn bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-none disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
export default Chat;

import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createSocketConnection } from "../utils/socket";
import { useSelector } from "react-redux";
import axios from "axios";
import { BASE_URL } from "../utils/constants";
import GroupMembers from "./GroupMembers";

const GroupChat = () => {
  const { groupChatId } = useParams();
  const navigate = useNavigate();
  const [groupChat, setGroupChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const user = useSelector((store) => store.user);
  const userId = user?._id;

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

  const fetchGroupChat = async () => {
    try {
      const response = await axios.get(BASE_URL + `/group-chat/${groupChatId}`, {
        withCredentials: true,
      });
      setGroupChat(response.data);

      // Map messages
      const chatMessages = response.data.messages.map((msg) => {
        const { senderId, text, imageUrl, createdAt } = msg;
        return {
          firstName: senderId?.firstName,
          lastName: senderId?.lastName,
          senderId: senderId?._id,
          text,
          imageUrl,
          timestamp: createdAt,
        };
      });
      setMessages(chatMessages);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupChat();
  }, [groupChatId]);

  useEffect(() => {
    if (!userId || !groupChatId) {
      return;
    }
    const socket = createSocketConnection();
    socket.emit("joinGroupChat", {
      groupChatId,
      firstName: user.firstName,
      userId,
    });

    socket.on("groupMessageReceived", ({ firstName, lastName, text, imageUrl, senderId }) => {
      console.log(firstName + " : " + (text || "sent an image"));
      setMessages((messages) => [
        ...messages,
        { firstName, lastName, senderId, text, imageUrl, timestamp: new Date().toISOString() },
      ]);
    });

    return () => {
      socket.disconnect();
    };
  }, [userId, groupChatId]);

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

    socket.emit("sendGroupMessage", {
      groupChatId,
      firstName: user.firstName,
      lastName: user.lastName,
      userId,
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

  if (loading) {
    return <div className="text-white text-center mt-10">Loading chat...</div>;
  }

  if (!groupChat) {
    return (
      <div className="text-center my-10">
        <h1 className="text-white text-3xl font-bold mb-5">Group Chat Not Found</h1>
        <button
          onClick={() => navigate("/connections")}
          className="btn bg-purple-500 text-white border-none"
        >
          Back to Connections
        </button>
      </div>
    );
  }

  const handleIconUpdate = (newIconUrl) => {
    setGroupChat((prev) => ({
      ...prev,
      groupIcon: newIconUrl,
    }));
  };

  const handleGroupUpdate = (updatedChat) => {
    setGroupChat(updatedChat);
  };

  return (
    <div className="w-3/4 mx-auto border-2 border-purple-300 m-5 h-[70vh] flex flex-col rounded-lg shadow-xl bg-white">
      {/* Header with clickable group info */}
      <div 
        onClick={() => setShowMembers(true)}
        className="p-5 border-b-2 border-purple-300 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-t-lg cursor-pointer hover:shadow-lg transition-all flex items-center gap-4"
      >
        <img
          src={BASE_URL + groupChat.groupIcon}
          alt="Group Icon"
          className="w-12 h-12 rounded-full object-cover"
          onError={(e) => {
            e.target.src = "https://via.placeholder.com/48?text=Group";
          }}
        />
        <div>
          <h1 className="font-bold text-xl">{groupChat.groupName}</h1>
          <p className="text-sm text-purple-100">
            {groupChat.participants.length} members
          </p>
        </div>
        <span className="ml-auto text-sm text-purple-100">Click to view members</span>
      </div>

      <div className="flex-1 overflow-scroll p-5 bg-gray-50">
        {messages.map((msg, index) => {
          const isCurrentUser = user.firstName === msg.firstName;
          return (
            <div key={index} className={"chat " + (isCurrentUser ? "chat-end" : "chat-start")}>
              <div className="chat-header font-bold text-gray-800">
                {`${msg.firstName}  ${msg.lastName}`}
                <time className="text-xs font-semibold text-gray-600">
                  {formatTime(msg.timestamp)}
                </time>
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
            <img src={imagePreview} alt="preview" className="max-h-32 max-w-xs rounded-lg" />
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

      <GroupMembers 
        groupChat={groupChat}
        isOpen={showMembers}
        onClose={() => setShowMembers(false)}
        onIconUpdate={handleIconUpdate}
        onGroupUpdate={handleGroupUpdate}
      />
    </div>
  );
};

export default GroupChat;

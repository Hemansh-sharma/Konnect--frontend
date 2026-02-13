import axios from "axios";
import { BASE_URL } from "../utils/constants";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addConnections } from "../utils/conectionSlice";
import { clearUnreadMessages } from "../utils/notificationSlice";
import { Link, useNavigate } from "react-router-dom";

const Connections = () => {
  const connections = useSelector((store) => store.connections);
  const unreadMessages = useSelector((store) => store.notification.unreadMessages);
  const onlineUsers = useSelector((store) => store.onlineUsers.users);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  const [groupChats, setGroupChats] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  const fetchConnections = async () => {
    try {
      const res = await axios.get(BASE_URL + "/user/connections", {
        withCredentials: true,
      });
      dispatch(addConnections(res.data.data));
    } catch (err) {
      // Handle Error Case
      console.error(err);
    }
  };

  const fetchGroupChats = async () => {
    try {
      const res = await axios.get(BASE_URL + "/my-group-chats", {
        withCredentials: true,
      });
      setGroupChats(res.data);
      setLoadingGroups(false);
    } catch (err) {
      console.error(err);
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    fetchGroupChats();
  }, []);

  if (!connections) return;

  return (
    <div className="text-center my-10">
      <div className="mb-8">
        <h1 className="text-bold text-white text-3xl mb-4">Connections</h1>
        {connections.length > 0 && (
          <button
            onClick={() => navigate("/create-group-chat")}
            className="btn bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white border-none"
          >
            ➕ Create Group Chat
          </button>
        )}
      </div>

      {/* Group Chats Section */}
      {!loadingGroups && groupChats.length > 0 && (
        <div className="mb-10">
          <h2 className="text-bold text-white text-2xl mb-4">Group Chats</h2>
          {groupChats.map((group) => {
            const { _id, groupName, participants, groupIcon } = group;

            return (
              <Link key={_id} to={`/group-chat/${_id}`}>
                <div className="flex m-4 p-4 rounded-lg bg-white border-2 border-green-200 w-1/2 mx-auto relative hover:shadow-lg hover:border-green-400 transition-all cursor-pointer">
                  <img
                    src={BASE_URL + groupIcon}
                    alt="Group Icon"
                    className="w-14 h-14 rounded-full object-cover"
                    onError={(e) => {
                      e.target.src = "https://via.placeholder.com/56?text=Group";
                    }}
                  />
                  <div className="flex-1 text-left ml-4">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-xl text-green-700">👥 {groupName}</h2>
                    </div>
                    <p className="text-gray-600 text-sm">
                      {participants?.length || 0} member{participants?.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button className="btn bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white border-none">
                    Open
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Connections Section */}
      {connections.length === 0 && groupChats.length === 0 && (
        <h1 className="text-white">No Connections Found</h1>
      )}

      {connections.length > 0 && (
        <div>
          <h2 className="text-bold text-white text-2xl mb-4">Direct Messages</h2>
          {connections.map((connection) => {
            const { _id, firstName, lastName, photoUrl, age, gender, about } =
              connection;
            const hasUnreadMessage = unreadMessages[_id];
            const isOnline = onlineUsers[_id] === true;

            return (
              <div
                key={_id}
                className="flex m-4 p-4 rounded-lg bg-white border-2 border-purple-200 w-1/2 mx-auto relative hover:shadow-lg hover:border-pink-300 transition-all"
              >
                {hasUnreadMessage && (
                  <div className="absolute top-2 right-2 text-2xl">🔔</div>
                )}
                <div className="relative">
                  <img
                    alt="photo"
                    className="w-20 h-20 rounded-full object-cover"
                    src={photoUrl}
                  />
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="text-left mx-4 ">
                  <h2 className="font-bold text-xl">
                    {firstName + " " + lastName}
                  </h2>
                  {age && gender && <p>{age + ", " + gender}</p>}
                  <p>{about}</p>
                  {isOnline && <p className="text-green-500 text-sm font-semibold">Online</p>}
                </div>
                <Link 
                  to={"/chat/" + _id}
                  onClick={() => {
                    // Clear unread message notification for this user when entering chat
                    dispatch(clearUnreadMessages(_id));
                  }}
                >
                  <button className="btn bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-none">Chat</button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default Connections;

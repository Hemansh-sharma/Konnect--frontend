import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";
import { BASE_URL } from "../utils/constants";
import { addConnections } from "../utils/conectionSlice";

const CreateGroupChat = () => {
  const connections = useSelector((store) => store.connections);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchConnections = async () => {
    try {
      const res = await axios.get(BASE_URL + "/user/connections", {
        withCredentials: true,
      });
      dispatch(addConnections(res.data.data));
    } catch (err) {
      console.error(err);
      setError("Failed to fetch connections");
    }
  };

  useEffect(() => {
    if (!connections || connections.length === 0) {
      fetchConnections();
    }
  }, []);

  const toggleMember = (memberId) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      setError("Please enter a group name");
      return;
    }

    if (selectedMembers.length === 0) {
      setError("Please select at least one member");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.post(
        BASE_URL + "/group-chat",
        {
          groupName: groupName.trim(),
          participantIds: selectedMembers,
        },
        {
          withCredentials: true,
        }
      );

      // Navigate to the newly created group chat
      navigate(`/group-chat/${response.data._id}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to create group chat");
    } finally {
      setLoading(false);
    }
  };

  if (!connections) return <div className="text-white text-center mt-10">Loading...</div>;

  if (connections.length === 0) {
    return (
      <div className="text-center my-10">
        <h1 className="text-white text-3xl font-bold mb-5">Create Group Chat</h1>
        <p className="text-gray-300">You need to have connections to create a group chat</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto my-10 p-5">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Create Group Chat</h1>

      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="mb-6">
          <label className="block text-gray-700 font-bold mb-2">Group Name</label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Enter group name"
            className="w-full border-2 border-purple-300 focus:border-pink-400 focus:outline-none rounded px-4 py-2 text-black placeholder-gray-500 bg-gray-100"
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 font-bold mb-4">Select Members</label>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {connections.map((connection) => (
              <div
                key={connection._id}
                className="flex items-center p-3 border-2 border-gray-200 rounded-lg hover:border-purple-300 transition-colors cursor-pointer"
                onClick={() => toggleMember(connection._id)}
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(connection._id)}
                  onChange={() => toggleMember(connection._id)}
                  className="w-5 h-5 rounded border-gray-300"
                />
                <img
                  src={connection.photoUrl}
                  alt={connection.firstName}
                  className="w-10 h-10 rounded-full ml-3 object-cover"
                />
                <div className="ml-3 flex-1">
                  <p className="font-bold text-gray-800">
                    {connection.firstName} {connection.lastName}
                  </p>
                  <p className="text-sm text-gray-600">{connection.about}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedMembers.length > 0 && (
          <div className="mb-4 p-3 bg-purple-100 rounded-lg">
            <p className="text-purple-800 font-semibold">
              {selectedMembers.length} member{selectedMembers.length !== 1 ? "s" : ""} selected
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={createGroup}
            disabled={loading}
            className="flex-1 btn bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-none disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Group"}
          </button>
          <button
            onClick={() => navigate("/connections")}
            className="flex-1 btn bg-gray-500 hover:bg-gray-600 text-white border-none"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupChat;

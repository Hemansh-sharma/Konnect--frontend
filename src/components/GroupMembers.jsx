import { useState, useRef } from "react";
import axios from "axios";
import { BASE_URL } from "../utils/constants";
import { useSelector } from "react-redux";

const GroupMembers = ({ groupChat, isOpen, onClose, onIconUpdate, onGroupUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const user = useSelector((store) => store.user);

  const isCurrentUserAdmin = groupChat?.admins?.some(
    (admin) => admin._id === user?._id || admin === user?._id
  );

  const handleIconSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("icon", file);

    try {
      const response = await axios.post(
        BASE_URL + `/group-chat/${groupChat._id}/icon`,
        formData,
        {
          withCredentials: true,
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      onIconUpdate(response.data.groupIcon);
      setUploading(false);
    } catch (err) {
      console.error(err);
      setError("Failed to update group icon");
      setUploading(false);
    }
  };

  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await axios.get(BASE_URL + `/user/browse?q=${query}`, {
        withCredentials: true,
      });

      // Filter out current members
      const currentMemberIds = groupChat.participants.map((p) => p._id || p);
      const filteredResults = response.data.filter(
        (user) => !currentMemberIds.includes(user._id)
      );

      setSearchResults(filteredResults);
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAddMember = async (memberId) => {
    setLoading(true);
    try {
      const response = await axios.post(
        BASE_URL + `/group-chat/${groupChat._id}/add-member/${memberId}`,
        {},
        {
          withCredentials: true,
        }
      );

      onGroupUpdate(response.data.chat);
      setSearchQuery("");
      setSearchResults([]);
      setShowAddMembers(false);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  const handleMakeAdmin = async (memberId) => {
    if (!isCurrentUserAdmin) {
      setError("Only admins can make other members admins");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        BASE_URL + `/group-chat/${groupChat._id}/make-admin/${memberId}`,
        {},
        {
          withCredentials: true,
        }
      );

      onGroupUpdate(response.data.chat);
      setError("");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to promote member");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!isCurrentUserAdmin) {
      setError("Only admins can remove members");
      return;
    }

    if (confirm("Are you sure you want to remove this member?")) {
      setLoading(true);
      try {
        const response = await axios.post(
          BASE_URL + `/group-chat/${groupChat._id}/remove-member/${memberId}`,
          {},
          {
            withCredentials: true,
          }
        );

        onGroupUpdate(response.data.chat);
        setError("");
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.error || "Failed to remove member");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRemoveAdmin = async (memberId) => {
    if (!isCurrentUserAdmin) {
      setError("Only admins can dismiss other admins");
      return;
    }

    if (confirm("Are you sure you want to remove admin status from this member?")) {
      setLoading(true);
      try {
        const response = await axios.post(
          BASE_URL + `/group-chat/${groupChat._id}/remove-admin/${memberId}`,
          {},
          {
            withCredentials: true,
          }
        );

        onGroupUpdate(response.data.chat);
        setError("");
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.error || "Failed to remove admin status");
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-bold text-gray-800">{groupChat.groupName}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ✕
          </button>
        </div>

        {/* Group Icon Section */}
        <div className="mb-6 text-center">
          <img
            src={BASE_URL + groupChat.groupIcon}
            alt="Group Icon"
            className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
            onError={(e) => {
              e.target.src = "https://via.placeholder.com/96?text=Group";
            }}
          />
          {isCurrentUserAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleIconSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn bg-blue-500 hover:bg-blue-600 text-white border-none text-sm disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Change Group Icon"}
              </button>
            </>
          )}
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        {/* Add Members Section */}
        {isCurrentUserAdmin && (
          <div className="mb-6">
            {!showAddMembers ? (
              <button
                onClick={() => setShowAddMembers(true)}
                disabled={loading}
                className="btn w-full bg-green-500 hover:bg-green-600 text-white border-none disabled:opacity-50"
              >
                + Add Members
              </button>
            ) : (
              <div className="border-2 border-green-300 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchUsers(e.target.value);
                    }}
                    className="flex-1 border-2 border-gray-300 rounded px-3 py-2 text-black text-sm"
                  />
                  <button
                    onClick={() => {
                      setShowAddMembers(false);
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                    className="btn btn-sm bg-gray-400 hover:bg-gray-500 text-white border-none"
                  >
                    Cancel
                  </button>
                </div>

                {searching && <p className="text-gray-500 text-sm">Searching...</p>}

                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {searchResults.map((searchUser) => (
                      <div
                        key={searchUser._id}
                        className="flex items-center justify-between p-2 bg-gray-100 rounded"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <img
                            src={searchUser.photoUrl}
                            alt={searchUser.firstName}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <span className="text-sm text-gray-800">
                            {searchUser.firstName} {searchUser.lastName}
                          </span>
                        </div>
                        <button
                          onClick={() => handleAddMember(searchUser._id)}
                          disabled={loading}
                          className="btn btn-xs bg-green-500 hover:bg-green-600 text-white border-none disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {searchQuery && searchResults.length === 0 && !searching && (
                  <p className="text-gray-500 text-sm">No users found</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Members Section */}
        <div>
          <h3 className="font-bold text-lg text-gray-800 mb-4">
            Members ({groupChat.participants?.length || 0})
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {groupChat.participants?.map((member) => {
              const memberAdmin = groupChat.admins?.some(
                (admin) => admin._id === member._id || admin === member._id
              );
              const isCreator = groupChat.createdBy === member._id ||
                groupChat.createdBy?._id === member._id;
              const isCurrentUser = user?._id === member._id || user?._id === member;

              return (
                <div
                  key={member._id}
                  className="flex items-center justify-between p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <img
                      src={member.photoUrl}
                      alt={member.firstName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">
                        {member.firstName} {member.lastName}
                        {isCurrentUser && " (You)"}
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        {memberAdmin && (
                          <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-semibold">
                            Admin
                          </span>
                        )}
                        {isCreator && (
                          <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-semibold">
                            Creator
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Admin Controls */}
                  {isCurrentUserAdmin && !isCurrentUser && !isCreator && (
                    <div className="flex gap-2">
                      {!memberAdmin && (
                        <button
                          onClick={() => handleMakeAdmin(member._id)}
                          disabled={loading}
                          className="btn btn-xs bg-purple-500 hover:bg-purple-600 text-white border-none disabled:opacity-50"
                          title="Make admin"
                        >
                          👑
                        </button>
                      )}
                      {memberAdmin && (
                        <button
                          onClick={() => handleRemoveAdmin(member._id)}
                          disabled={loading}
                          className="btn btn-xs bg-yellow-500 hover:bg-yellow-600 text-white border-none disabled:opacity-50"
                          title="Dismiss admin"
                        >
                          ⬇️
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveMember(member._id)}
                        disabled={loading}
                        className="btn btn-xs bg-red-500 hover:bg-red-600 text-white border-none disabled:opacity-50"
                        title="Remove member"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="btn w-full bg-gray-400 hover:bg-gray-500 text-white border-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupMembers;

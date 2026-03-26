import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createSocketConnection } from "../utils/socket";
import WebRTCManager from "../utils/webrtcManager";
import {
  toggleAudio,
  toggleVideo,
  setScreenSharing,
  endCall,
} from "../utils/callSlice";

const GroupVideoCall = ({ groupChatId, groupName, participants, onCallEnd }) => {
  const dispatch = useDispatch();
  const call = useSelector((store) => store.call);
  const user = useSelector((store) => store.user);
  const [callDuration, setCallDuration] = useState(0);
  const [participants_, setParticipants_] = useState([]);
  
  // Use local state for streams instead of Redux (MediaStream is not serializable)
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const webrtcRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const hasLeftCallRef = useRef(false);

  // Timer for call duration
  useEffect(() => {
    if (call.callStatus === "connected") {
      const timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [call.callStatus]);

  // Attach local stream whenever stream or element becomes available.
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream || null;
    }
  }, [localStream]);

  // Initialize local stream and join group call
  useEffect(() => {
    const initializeGroupCall = async () => {
      const socket = createSocketConnection();
      socketRef.current = socket;
      webrtcRef.current = new WebRTCManager(socket);

      let stream = null;

      // Try to get media with fallbacks
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch (err) {
        console.warn("Camera+mic failed, trying audio only:", err.message);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (err2) {
          console.warn("Audio only failed, trying video only:", err2.message);
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          } catch (err3) {
            console.warn("All media access failed, joining call without media:", err3.message);
          }
        }
      }

      if (stream) {
        setLocalStream(stream);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }

      // Join group call regardless of media access
      socket.emit("joinGroupCall", {
        groupChatId,
        userId: user?._id,
        userName: `${user?.firstName} ${user?.lastName}`,
      });

      // Set up socket listeners for group call signaling
      setupGroupSocketListeners(socket, stream);
    };

    initializeGroupCall();

    return () => {
      leaveGroupCall();

      // Stop all media tracks using the ref (not stale closure)
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      webrtcRef.current?.endAllCalls();
      // Remove only our listeners, don't disconnect the shared socket
      socketRef.current?.off("existingParticipants");
      socketRef.current?.off("participantJoined");
      socketRef.current?.off("rtcSignal");
      socketRef.current?.off("iceCandidate");
      socketRef.current?.off("participantLeft");
      socketRef.current?.off("groupCallEnded");
    };
  }, []);

  const setupGroupSocketListeners = (socket, localStream) => {
    // Listen for existing participants
    socket.on("existingParticipants", ({ participants: existingParticipants }) => {
      const normalizedParticipants = (existingParticipants || []).filter(
        (participant) => participant?.userId && participant.userId !== user?._id
      );

      setParticipants_(normalizedParticipants);
      // Create peer connections with existing participants
      normalizedParticipants.forEach((participant) => {
        createPeerConnection(localStream, participant.userId, true, participant.userName);
      });
    });

    // Listen for new participant joining
    socket.on("participantJoined", ({ userId, userName }) => {
      if (!userId || userId === user?._id) {
        return;
      }

      setParticipants_((prev) => [...prev, { userId, userName }]);
      createPeerConnection(localStream, userId, false, userName);
    });

    // Listen for WebRTC signals from peer
    socket.on("rtcSignal", ({ from, to, signal }) => {
      if (!from || from === user?._id) {
        return;
      }

      if (to && to !== user?._id) {
        return;
      }

      if (!webrtcRef.current?.peers.has(from) && signal?.type === "offer") {
        createPeerConnection(localStreamRef.current, from, false, "Participant");
      }

      if (webrtcRef.current?.peers.has(from)) {
        webrtcRef.current.signal(from, signal);
      }
    });

    // Listen for ICE candidates
    socket.on("iceCandidate", ({ from, to, candidate }) => {
      if (!from || from === user?._id) {
        return;
      }

      if (to && to !== user?._id) {
        return;
      }

      if (webrtcRef.current?.peers.has(from)) {
        webrtcRef.current.addIceCandidate(from, candidate);
      }
    });

    // Listen for participant leaving
    socket.on("participantLeft", ({ userId }) => {
      setParticipants_((prev) => prev.filter((p) => p.userId !== userId));
      webrtcRef.current?.endPeerCall(userId);
      if (remoteVideosRef.current[userId]) {
        delete remoteVideosRef.current[userId];
      }
      // Update remote streams state
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[userId];
        return newStreams;
      });
    });

    // Listen for group call ended
    socket.on("groupCallEnded", () => {
      endCallHandler(false);
    });
  };

  const createPeerConnection = (stream, peerId, initiator, peerName) => {
    if (!peerId || peerId === user?._id || webrtcRef.current?.peers.has(peerId)) {
      return;
    }

    webrtcRef.current?.createPeer(
      initiator,
      stream,
      peerId,
      (remoteStream) => {
        remoteVideosRef.current[peerId] = { stream: remoteStream, name: peerName };
        // Update remote streams state
        setRemoteStreams(prev => ({
          ...prev,
          [peerId]: { stream: remoteStream, name: peerName }
        }));
      },
      (signal) => {
        socketRef.current?.emit("rtcSignal", {
          from: user?._id,
          to: peerId,
          groupChatId,
          signal,
        });
      }
    );
  };

  const toggleAudioHandler = () => {
    dispatch(toggleAudio());
    webrtcRef.current?.toggleAudio(localStream, !call.isAudioEnabled);
  };

  const toggleVideoHandler = () => {
    dispatch(toggleVideo());
    webrtcRef.current?.toggleVideo(localStream, !call.isVideoEnabled);
  };

  const toggleScreenShareHandler = async () => {
    const shouldShare = !call.isScreenSharing;
    const baseStream = localStreamRef.current || localStream;
    const resultStream = await webrtcRef.current?.toggleScreenShare(
      baseStream,
      shouldShare,
      () => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current || localStream || null;
        }
        dispatch(setScreenSharing(false));
      }
    );

    if (shouldShare && resultStream) {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = resultStream;
      }
      dispatch(setScreenSharing(true));
      return;
    }

    if (!shouldShare) {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = baseStream || null;
      }
      dispatch(setScreenSharing(false));
    }
  };

  const leaveGroupCall = () => {
    if (hasLeftCallRef.current) {
      return;
    }

    hasLeftCallRef.current = true;
    socketRef.current?.emit("participantLeft", {
      groupChatId,
      userId: user?._id,
    });
  };

  const endCallHandler = (notifyLeave = true) => {
    if (notifyLeave) {
      leaveGroupCall();
    } else {
      hasLeftCallRef.current = true;
    }

    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Also stop via state reference as fallback
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    webrtcRef.current?.endAllCalls();

    // Clear the video element
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setLocalStream(null);
    setRemoteStreams({});

    dispatch(endCall());
    onCallEnd();
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const videoTiles = [
    {
      id: "local",
      name: `${user?.firstName || "You"} (You)`,
      stream: localStream,
      isLocal: true,
    },
    ...Object.entries(remoteStreams).map(([remoteUserId, videoData]) => ({
      id: remoteUserId,
      name: videoData.name,
      stream: videoData.stream,
      isLocal: false,
    })),
  ];

  const hasPinnedTile = pinnedParticipantId && videoTiles.some((tile) => tile.id === pinnedParticipantId);
  const primaryTile = hasPinnedTile
    ? videoTiles.find((tile) => tile.id === pinnedParticipantId)
    : videoTiles[0];
  const secondaryTiles = hasPinnedTile
    ? videoTiles.filter((tile) => tile.id !== pinnedParticipantId)
    : videoTiles.slice(1);

  const handleTogglePin = (tileId) => {
    setPinnedParticipantId((prev) => (prev === tileId ? null : tileId));
  };

  useEffect(() => {
    if (pinnedParticipantId && !hasPinnedTile) {
      setPinnedParticipantId(null);
    }
  }, [pinnedParticipantId, hasPinnedTile]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Video Area */}
      {!hasPinnedTile ? (
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-4 h-full">
            <div className="relative bg-gray-900 rounded-lg overflow-hidden">
              <button
                onClick={() => handleTogglePin("local")}
                className="absolute top-2 right-2 z-20 bg-black/70 text-white px-2 py-1 rounded text-xs"
                title="Pin video"
              >
                📌
              </button>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                {user?.firstName} (You)
              </div>
            </div>

            {Object.entries(remoteStreams).map(([remoteUserId, videoData]) => (
              <div key={remoteUserId} className="relative bg-gray-900 rounded-lg overflow-hidden">
                <button
                  onClick={() => handleTogglePin(remoteUserId)}
                  className="absolute top-2 right-2 z-20 bg-black/70 text-white px-2 py-1 rounded text-xs"
                  title="Pin video"
                >
                  📌
                </button>
                {videoData.stream && <RemoteVideo stream={videoData.stream} />}
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                  {videoData.name}
                </div>
              </div>
            ))}

            {Object.keys(remoteStreams).length < 3 && (
              <div className="bg-gray-900 rounded-lg flex items-center justify-center">
                <div className="text-gray-500 text-center">
                  <div className="text-4xl mb-2">👤</div>
                  <p className="text-sm">Waiting for participants...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden p-4 flex flex-col gap-3">
          <div className="relative flex-1 bg-gray-900 rounded-lg overflow-hidden min-h-[220px]">
            {primaryTile?.isLocal ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
            ) : (
              <RemoteVideo stream={primaryTile?.stream} />
            )}

            <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
              Pinned
            </div>
            <button
              onClick={() => setPinnedParticipantId(null)}
              className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs"
              title="Unpin video"
            >
              Unpin
            </button>
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
              {primaryTile?.name}
            </div>
          </div>

          <div className="h-32 flex gap-3 overflow-x-auto pb-1">
            {secondaryTiles.map((tile) => (
              <div
                key={tile.id}
                className="relative w-48 min-w-48 bg-gray-900 rounded-lg overflow-hidden border border-gray-700"
              >
                <button
                  onClick={() => handleTogglePin(tile.id)}
                  className="absolute top-2 right-2 z-20 bg-black/70 text-white px-2 py-1 rounded text-xs"
                  title="Pin video"
                >
                  📌
                </button>

                {tile.isLocal ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <RemoteVideo stream={tile.stream} />
                )}

                <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                  {tile.name}
                </div>
              </div>
            ))}

            {secondaryTiles.length === 0 && (
              <div className="w-48 min-w-48 bg-gray-900 rounded-lg flex items-center justify-center border border-gray-700">
                <div className="text-gray-500 text-center">
                  <div className="text-2xl mb-1">👤</div>
                  <p className="text-xs">Waiting for participants...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top info bar */}
      <div className="bg-black bg-opacity-75 px-6 py-3 text-white flex justify-between items-center">
        <div>
          <p className="text-lg font-bold">{groupName}</p>
          <p className="text-sm text-gray-300">
            {participants_.length + 1} participant(s)
          </p>
        </div>
        {call.callStatus === "connected" && (
          <p className="text-sm text-gray-300">{formatDuration(callDuration)}</p>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black px-6 py-4 flex justify-center gap-4">
        <button
          onClick={toggleAudioHandler}
          className={`p-4 rounded-full transition-colors ${
            call.isAudioEnabled
              ? "bg-gray-700 hover:bg-gray-600"
              : "bg-red-600 hover:bg-red-700"
          }`}
          title={call.isAudioEnabled ? "Mute" : "Unmute"}
        >
          <span className="text-2xl">
            {call.isAudioEnabled ? "🎤" : "🔇"}
          </span>
        </button>

        <button
          onClick={toggleVideoHandler}
          className={`p-4 rounded-full transition-colors ${
            call.isVideoEnabled
              ? "bg-gray-700 hover:bg-gray-600"
              : "bg-red-600 hover:bg-red-700"
          }`}
          title={call.isVideoEnabled ? "Stop Video" : "Start Video"}
        >
          <span className="text-2xl">
            {call.isVideoEnabled ? "📹" : "🚫"}
          </span>
        </button>

        <button
          onClick={toggleScreenShareHandler}
          className={`p-4 rounded-full transition-colors ${
            call.isScreenSharing
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-gray-700 hover:bg-gray-600"
          }`}
          title={call.isScreenSharing ? "Stop Sharing" : "Share Screen"}
        >
          <span className="text-2xl">
            {call.isScreenSharing ? "🛑" : "🖥️"}
          </span>
        </button>

        <button
          onClick={endCallHandler}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white"
          title="End Call"
        >
          <span className="text-2xl">☎️</span>
        </button>
      </div>
    </div>
  );
};

// Helper component to display remote video
const RemoteVideo = ({ stream }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-contain"
    />
  );
};

export default GroupVideoCall;

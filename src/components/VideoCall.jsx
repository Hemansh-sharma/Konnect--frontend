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

const VideoCall = ({ targetUserId, targetName, isInitiator = true, onCallEnd }) => {
  const dispatch = useDispatch();
  const call = useSelector((store) => store.call);
  const user = useSelector((store) => store.user);
  const [callDuration, setCallDuration] = useState(0);
  
  // Use local state for streams instead of Redux (MediaStream is not serializable)
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [mediaError, setMediaError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const webrtcRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingSignalsRef = useRef([]);

  // Log component mounting
  useEffect(() => {
    console.log(
      `\n${'═'.repeat(50)}\n` +
      `[COMPONENT MOUNT] VideoCall ${isInitiator ? '🔴 INITIATOR' : '🟢 RECEIVER'}\n` +
      `targetUserId: ${targetUserId}, targetName: ${targetName}\n` +
      `myUserId: ${user?._id}\n` +
      `${'═'.repeat(50)}\n`
    );

    return () => {
      console.log(`[COMPONENT UNMOUNT] VideoCall ${isInitiator ? 'INITIATOR' : 'RECEIVER'}`);
    };
  }, [isInitiator, targetUserId, user?._id]);

  // Timer for call duration
  useEffect(() => {
    if (call.callStatus === "connected") {
      const timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [call.callStatus]);

  // Ensure local stream is attached to video element
  useEffect(() => {
    console.log("useEffect: localStream changed", !!localStream);
    if (localStream && localVideoRef.current) {
      console.log("Attaching local stream to video element");
      localVideoRef.current.srcObject = localStream;
      // Don't call play() - let the autoPlay attribute handle it
      // Calling play() can cause AbortError
    }
  }, [localStream]);

  // Ensure remote stream is attached to video element
  useEffect(() => {
    console.log("useEffect: remoteStream changed", !!remoteStream);
    if (remoteStream && remoteVideoRef.current) {
      console.log("Attaching remote stream to video element with tracks:", remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      remoteVideoRef.current.srcObject = remoteStream;
      // Don't call play() - let the autoPlay attribute handle it
    }
  }, [remoteStream]);

  // Initialize local stream
  useEffect(() => {
    const initializeStream = async () => {
      console.log(`[INIT] Starting stream initialization for ${isInitiator ? 'INITIATOR' : 'RECEIVER'}`);
      
      const socket = createSocketConnection();
      socketRef.current = socket;
      webrtcRef.current = new WebRTCManager(socket);

      // Attach signaling listeners immediately so early offer/ICE events are not missed.
      setupSocketListeners(socket);

      let stream = null;
      let error = null;

      // Try to get media with fallbacks
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch (err) {
        console.warn("Camera+mic failed, trying audio only:", err.message);
        error = err;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          error = null;
        } catch (err2) {
          console.warn("Audio only failed, trying video only:", err2.message);
          error = err2;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
            error = null;
          } catch (err3) {
            console.warn("All media access failed, joining call without media:", err3.message);
            error = err3;
          }
        }
      }

      if (stream) {
        // Ensure all tracks are enabled
        stream.getTracks().forEach((track) => {
          track.enabled = true;
          console.log(`Track enabled - ${track.kind}:`, track.enabled);
        });
        
        setLocalStream(stream);
        localStreamRef.current = stream;
        
        // Set srcObject after state is updated
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setMediaError(null);
        console.log("Local stream initialized successfully with tracks:", stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      } else if (error) {
        const errorMsg = error.name === "NotAllowedError" 
          ? "Camera/microphone access denied. Please grant permissions and refresh."
          : error.name === "NotFoundError"
          ? "No camera/microphone found on this device."
          : `Media access error: ${error.message}`;
        setMediaError(errorMsg);
        console.error(errorMsg, error);
      }

      // Receiver can create peer after media is ready; any early signals are queued.
      if (!isInitiator && targetUserId && !webrtcRef.current?.peers.has(targetUserId)) {
        createPeerConnection(stream, targetUserId, false);
      }

      // Replay queued signals after peer setup.
      if (pendingSignalsRef.current.length > 0) {
        console.log(`Replaying ${pendingSignalsRef.current.length} queued signal(s)`);
        const queuedSignals = [...pendingSignalsRef.current];
        pendingSignalsRef.current = [];
        queuedSignals.forEach(({ from, signal }) => {
          if (!webrtcRef.current?.peers.has(from)) {
            createPeerConnection(localStreamRef.current, from, false);
          }
          webrtcRef.current?.signal(from, signal);
        });
      }
    };

    initializeStream();

    return () => {
      console.log(`[CLEANUP] Cleaning up ${isInitiator ? 'INITIATOR' : 'RECEIVER'} VideoCall`);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      webrtcRef.current?.endAllCalls();
      // Remove only our listeners
      socketRef.current?.off("callAccepted");
      socketRef.current?.off("callRejected");
      socketRef.current?.off("rtcSignal");
      socketRef.current?.off("iceCandidate");
      socketRef.current?.off("callEnded");
    };
  }, []);

  const setupSocketListeners = (socket) => {
    console.log("Setting up socket listeners. Initiator:", isInitiator, "Has local stream:", !!localStreamRef.current, "targetUserId:", targetUserId);
    
    if (isInitiator) {
      // Caller: wait for acceptance, then create peer
      socket.on("callAccepted", ({ from }) => {
        console.log("🎉 [INITIATOR] Call accepted from", from, "NOW creating peer connection");
        createPeerConnection(localStreamRef.current, from, true);
      });

      socket.on("callRejected", () => {
        console.log("❌ [INITIATOR] Call was rejected");
        alert("Call rejected");
        onCallEnd();
      });
    }

    // Listen for WebRTC signals from peer
    socket.on("rtcSignal", ({ from, signal }) => {
      console.log(`📡 [SIGNAL IN] from ${from}, signal type:`, signal.type || "ICE candidate");
      console.log(`Peers available:`, Array.from(webrtcRef.current?.peers.keys() || []));
      
      if (!webrtcRef.current?.peers.has(from)) {
        if (!localStreamRef.current) {
          console.warn(`⚠️ Local stream not ready yet. Queueing signal from ${from}`);
          pendingSignalsRef.current.push({ from, signal });
          return;
        }

        console.warn(`⚠️ No peer found for ${from}. Creating peer now.`);
        createPeerConnection(localStreamRef.current, from, false);
      }
      
      if (webrtcRef.current?.peers.has(from)) {
        console.log(`✓ Passing signal to peer ${from}`);
        webrtcRef.current.signal(from, signal);
      } else {
        console.error(`❌ Still no peer for ${from} after attempted creation`);
      }
    });

    // Listen for ICE candidates
    socket.on("iceCandidate", ({ from, candidate }) => {
      console.log(`🧊 [ICE] from ${from}`);
      if (webrtcRef.current?.peers.has(from)) {
        webrtcRef.current.addIceCandidate(from, candidate);
      } else {
        // Queue ICE until peer exists; WebRTCManager will queue again until remote SDP is set.
        pendingSignalsRef.current.push({
          from,
          signal: { type: "iceCandidate", candidate },
        });
      }
    });

    // Listen for call end
    socket.on("callEnded", ({ from }) => {
      console.log("☎️ Call ended by", from);
      endCallHandler();
    });
  };

  const createPeerConnection = (stream, peerId, initiator) => {
    console.log(`\n🔗 [PEER] Creating peer - initiator: ${initiator}, peerId: ${peerId}, hasStream: ${!!stream}\n`);
   
       if (!webrtcRef.current) {
         console.error("❌ [ERROR] webrtcRef.current is null - WebRTCManager not initialized");
         return;
       }

       if (webrtcRef.current.peers.has(peerId)) {
         console.log(`ℹ️ [PEER] Peer already exists for ${peerId}, skipping creation`);
         return;
       }
    
       try {
         webrtcRef.current.createPeer(
           initiator,
           stream,
           peerId,
           (remoteStream) => {
             console.log(`\n✅ [SUCCESS] Remote stream received from ${peerId}!\n`);
             console.log("Remote stream tracks:", remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
             setRemoteStream(remoteStream);
             if (remoteVideoRef.current) {
               console.log("Attaching remote stream to video element");
               remoteVideoRef.current.srcObject = remoteStream;
             }
           },
           (signal) => {
             console.log(`📤 [SIGNAL OUT] to ${peerId}, type:`, signal.type || "ICE");
             socketRef.current?.emit("rtcSignal", {
               from: user?._id,
               to: peerId,
               signal,
             });
           }
         );
       } catch (error) {
         console.error("❌ [ERROR] Failed to create peer connection:", error);
       }
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

  const endCallHandler = () => {
    socketRef.current?.emit("endCall", {
      from: user?._id,
      to: targetUserId,
    });

    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    webrtcRef.current?.endAllCalls();

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setLocalStream(null);
    setRemoteStream(null);

    dispatch(endCall());
    onCallEnd();
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Media Error Display */}
      {mediaError && (
        <div className="fixed top-4 left-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-md">
          <p className="font-bold">⚠️ Media Access Error</p>
          <p className="text-sm mt-1">{mediaError}</p>
        </div>
      )}

      {/* Remote video - main display */}
      <div className="relative h-full bg-gray-900 flex items-center justify-center overflow-hidden">
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            controls={false}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-white text-center">
            <div className="text-4xl mb-4">📱</div>
            <p>Connecting to {targetName}...</p>
          </div>
        )}

        {/* Local video - picture in picture */}
        <div className="absolute right-4 md:right-6 bottom-24 md:bottom-28 w-28 h-40 sm:w-36 sm:h-48 md:w-44 md:h-56 bg-gray-800 rounded-xl overflow-hidden shadow-lg border-2 border-white z-20">
          {localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              controls={false}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white text-xs text-center p-2">
              <span>Your Camera</span>
            </div>
          )}
        </div>

        {/* Call info */}
        <div className="absolute top-6 left-6 text-white z-20">
          <p className="text-2xl font-bold">{targetName}</p>
          <p className="text-sm text-gray-300">
            {call.callStatus === "connected" && (
              <span>{formatDuration(callDuration)}</span>
            )}
          </p>
        </div>

        {/* Controls */}
        <div className="absolute left-0 right-0 bottom-0 z-30 px-4 md:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
          <div className="flex justify-center gap-3 md:gap-4">
            <button
              onClick={toggleAudioHandler}
              className={`p-3 md:p-4 rounded-full transition-colors ${
                call.isAudioEnabled
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-red-600 hover:bg-red-700"
              }`}
              title={call.isAudioEnabled ? "Mute" : "Unmute"}
            >
              <span className="text-xl md:text-2xl">
                {call.isAudioEnabled ? "🎤" : "🔇"}
              </span>
            </button>

            <button
              onClick={toggleVideoHandler}
              className={`p-3 md:p-4 rounded-full transition-colors ${
                call.isVideoEnabled
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-red-600 hover:bg-red-700"
              }`}
              title={call.isVideoEnabled ? "Stop Video" : "Start Video"}
            >
              <span className="text-xl md:text-2xl">
                {call.isVideoEnabled ? "📹" : "🚫"}
              </span>
            </button>

            <button
              onClick={toggleScreenShareHandler}
              className={`p-3 md:p-4 rounded-full transition-colors ${
                call.isScreenSharing
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
              title={call.isScreenSharing ? "Stop Sharing" : "Share Screen"}
            >
              <span className="text-xl md:text-2xl">
                {call.isScreenSharing ? "🛑" : "🖥️"}
              </span>
            </button>

            <button
              onClick={endCallHandler}
              className="p-3 md:p-4 rounded-full bg-red-600 hover:bg-red-700 text-white"
              title="End Call"
            >
              <span className="text-xl md:text-2xl">☎️</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCall;

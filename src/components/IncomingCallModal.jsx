import { useDispatch, useSelector } from "react-redux";
import { setIncomingCall, rejectCall } from "../utils/callSlice";

const IncomingCallModal = ({ onAccept, onReject }) => {
  const call = useSelector((store) => store.call);

  if (!call.incomingCall) return null;

  const isGroupCall = call.incomingCall.groupChatId;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[999]">
      <div className="bg-white rounded-lg p-8 text-center max-w-sm w-full mx-4">
        <div className="text-6xl mb-4">{isGroupCall ? "👥" : "☎️"}</div>
        <h2 className="text-2xl font-bold mb-2">
          {isGroupCall ? "Group Call" : "Incoming Call"}
        </h2>
        <p className="text-gray-600 mb-2 text-lg">{call.incomingCall.fromName}</p>
        <p className="text-gray-500 mb-6">
          {call.incomingCall.type === "video" ? "📹 Video Call" : "🎤 Audio Call"}
        </p>

        <div className="flex gap-4">
          <button
            onClick={onReject}
            className="flex-1 btn bg-red-600 hover:bg-red-700 text-white border-none"
          >
            Reject ❌
          </button>
          <button
            onClick={onAccept}
            className="flex-1 btn bg-green-600 hover:bg-green-700 text-white border-none"
          >
            Accept ✓
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;

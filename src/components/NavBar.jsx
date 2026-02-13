import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { BASE_URL } from "../utils/constants";
import { removeUser } from "../utils/userSlice";
import { clearNewRequests } from "../utils/notificationSlice";

const NavBar = () => {
  const user = useSelector((store) => store.user);
  const notification = useSelector((store) => store.notification);
  const { hasNewRequests, unreadMessages } = notification;
  const hasUnreadMessages = Object.values(unreadMessages).some(val => val === true);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await axios.post(BASE_URL + "/logout", {}, { withCredentials: true });
      dispatch(removeUser());
      return navigate("/login");
    } catch (err) {
      // Error logic maybe redirect to error page
      console.log(err);
    }
  };

  const handleRequestsClick = () => {
    dispatch(clearNewRequests());
  };

  const handleConnectionsClick = () => {
    // Don't clear here - clear per user when they enter chat
  };

  return (
    <div className="navbar bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 shadow-lg">
      <div className="flex-1">
        <Link to="/" className="btn btn-ghost text-xl text-white font-bold hover:bg-purple-700">
          👩‍💻 Konnect
        </Link>
      </div>
      {user && (
        <div className="flex-none gap-2">
          <div className="form-control text-white font-bold text-lg">Welcome, {user.firstName}</div>
          <div className="dropdown dropdown-end mx-5 flex">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle avatar"
            >
              <div className="w-10 rounded-full">
                <img alt="user photo" src={user.photoUrl} />
              </div>
            </div>
            <ul
              tabIndex={0}
              className="menu menu-sm dropdown-content bg-white rounded-box z-[1] mt-3 w-52 p-2 shadow-lg"
            >
              <li>
                <Link to="/profile" className="justify-between font-bold text-purple-600 hover:text-purple-800">
                  Profile
                </Link>
              </li>
              <li>
                <Link 
                  to="/connections" 
                  onClick={handleConnectionsClick}
                  className={`font-bold ${hasUnreadMessages ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white" : "text-purple-600 hover:text-purple-800"}`}
                >
                  Connections {hasUnreadMessages && "🔔"}
                </Link>
              </li>

              <li>
                <Link 
                  to="/requests"
                  onClick={handleRequestsClick}
                  className={`font-bold ${hasNewRequests ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white" : "text-purple-600 hover:text-purple-800"}`}
                >
                  Requests {hasNewRequests && "🔔"}
                </Link>
              </li>
              
              <li>
                <a onClick={handleLogout} className="font-bold text-purple-600 hover:text-purple-800">Logout</a>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
export default NavBar;

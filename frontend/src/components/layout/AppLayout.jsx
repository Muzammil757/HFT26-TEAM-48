import { Outlet } from "react-router-dom";
import OfflineBanner from "./OfflineBanner.jsx";
import Sidebar from "./Sidebar.jsx";
import Toasts from "./Toasts.jsx";
import TopBar from "./TopBar.jsx";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <Sidebar />
      <div className="ml-[240px] flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar />
        <OfflineBanner />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  );
}

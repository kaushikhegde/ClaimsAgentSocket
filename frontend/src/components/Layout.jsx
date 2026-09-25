import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[260px] flex-1 relative z-[1]">
        <div className="p-7 pl-9 pb-15 max-w-[1200px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

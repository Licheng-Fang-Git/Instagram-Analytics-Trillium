// src/app/dashboard/layout.jsx

export default function DashboardLayout({ children }) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Optional: You can put a Sidebar or Navbar component here later */}
        <aside className="w-64 bg-white border-r border-gray-200 p-6 hidden md:block">
          <div className="font-bold text-xl mb-6 text-blue-600">AnalyticsApp</div>
          <nav className="space-y-2">
            <a href="/dashboard" className="block px-4 py-2 rounded bg-blue-5 text-blue-700 font-medium">
              Overview
            </a>
          </nav>
          <nav className="space-y-2">
            <a href="/reel_intern_day" className="block px-4 py-2 rounded bg-blue-5 text-blue-700 font-medium">
              Intern Day Reel
            </a>
          </nav>
          <nav className="space-y-2">
            <a href="/meet_the_mentors" className="block px-4 py-2 rounded bg-blue-5 text-blue-700 font-medium">
              Meet the Mentors
            </a>
          </nav>
          <nav className="space-y-2">
            <a href="/nasdaq_times_square" className="block px-4 py-2 rounded bg-blue-5 text-blue-700 font-medium">
              Nasdaq Times Square
            </a>
          </nav>
          <nav className="space-y-2">
              <a href="/meet_2026_interns" className="block px-4 py-2 rounded bg-blue-5 text-blue-700 font-medium">
              Meet the 2026 Interns
              </a>
          </nav>
          <nav className="space-y-2">
            <a href="/mic_on" className="block px-4 py-2 rounded bg-blue-5 text-blue-700 font-medium">
              Mic On 
            </a>
          </nav>
          <nav className="space-y-2">
            <a href="/compare" className="block px-4 py-2 rounded bg-blue-5 text-blue-700 font-medium">
              Compare Posts
            </a>
          </nav>
          
        </aside>
  
        {/* Main content area where your dashboard page.jsx will render */}
        <main className="flex-1 bg-gray-50">
          {children}
        </main>
      </div>
    );
  }
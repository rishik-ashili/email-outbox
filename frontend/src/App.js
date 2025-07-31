import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl">
        <div className="md:flex">
          <div className="md:shrink-0">
            <img className="h-48 w-full object-cover md:h-full md:w-48" src={logo} alt="React Logo" />
          </div>
          <div className="p-8">
            <div className="uppercase tracking-wide text-sm text-indigo-500 font-semibold">
              Email Management System
            </div>
            <h1 className="block mt-1 text-lg leading-tight font-medium text-black">
              React Frontend with Tailwind CSS
            </h1>
            <p className="mt-2 text-slate-500">
              Your React frontend is now set up with Tailwind CSS! 
              The styling you see here proves that Tailwind is working correctly.
            </p>
            <button className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

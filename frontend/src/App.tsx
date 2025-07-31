import React, { useState, useEffect, useCallback, memo } from 'react';
import axios from 'axios';

// --- API Configuration ---
const API_BASE_URL = 'http://localhost:3000';

// --- Type Definitions ---
type EmailCategory = 'Interested' | 'Meeting Booked' | 'Not Interested' | 'Spam' | 'Out of Office';
interface Email {
  id: string; subject: string; from: string; body: string; date: string; category: EmailCategory;
}
interface Stats {
  emails: { totalEmails: number; categoryCounts: Record<EmailCategory, number>; };
  ai: { quota: { calls: number; limit: number; }; categorizationEnabled: boolean; };
  connections: Record<string, boolean>;
}
interface ChatMessage {
  role: 'user' | 'model'; content: string;
}



interface SidebarProps {
  selectedCategory: EmailCategory | 'All';
  onSelectCategory: (category: EmailCategory | 'All') => void;
  onFetchStats: () => void;
}
const Sidebar = memo(({ selectedCategory, onSelectCategory, onFetchStats }: SidebarProps) => {
  const handleHealthCheck = useCallback(() => {
    axios.get(`${API_BASE_URL}/health`).then(res => {
      console.log("Health Check:", res.data);
      alert("Health check successful! See browser console (F12) for details.");
    }).catch(err => {
      console.error("Health Check Failed:", err);
      alert("Health check failed. See browser console (F12) for details.");
    });
  }, []);

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-700 p-4 flex flex-col shrink-0">
      <h1 className="text-2xl font-bold text-white mb-6">📧 Email Onebox</h1>
      <nav className="flex flex-col space-y-2">
        {(['All', 'Interested', 'Meeting Booked', 'Not Interested', 'Spam', 'Out of Office'] as const).map(cat => (
          <button key={cat} onClick={() => onSelectCategory(cat)} className={`text-left px-4 py-2 rounded-md transition-colors ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
            {cat}
          </button>
        ))}
      </nav>
      <div className="mt-auto space-y-2">
        <button onClick={onFetchStats} className="w-full bg-gray-700 text-white px-4 py-2 rounded-md hover:bg-gray-600">System Stats</button>
        <button onClick={handleHealthCheck} className="w-full bg-gray-700 text-white px-4 py-2 rounded-md hover:bg-gray-600">Health Check</button>
      </div>
    </div>
  );
});

interface EmailListProps {
  emails: Email[];
  loading: boolean;
  selectedEmail: Email | null;
  onSelectEmail: (email: Email) => void;
  onSearchTermChange: (term: string) => void;
}
const EmailList = memo(({ emails, loading, selectedEmail, onSelectEmail, onSearchTermChange }: EmailListProps) => (
  <div className="flex-1 border-r border-gray-700 flex flex-col bg-gray-800">
    <div className="p-4 border-b border-gray-700">
      <input type="text" placeholder="Search emails..." className="w-full p-2 border border-gray-600 rounded-md bg-gray-700 text-white" onChange={(e) => onSearchTermChange(e.target.value)} />
    </div>
    <div className="overflow-y-auto">
      {loading ? <p className="p-4">Loading emails...</p> : emails.map(email => (
        <div key={email.id} onClick={() => onSelectEmail(email)} className={`p-4 border-b border-gray-700 cursor-pointer ${selectedEmail?.id === email.id ? 'bg-blue-900' : 'hover:bg-gray-700'}`}>
          <h3 className="font-semibold truncate text-white">{email.subject}</h3>
          <p className="text-sm text-gray-400 truncate">{email.from}</p>
          <p className="text-xs text-gray-500">{new Date(email.date).toLocaleString()}</p>
        </div>
      ))}
    </div>
  </div>
));

interface EmailViewerProps {
  selectedEmail: Email | null;
  aiReply: { content: string; loading: boolean };
  onGenerateReply: () => void;
}
const EmailViewer = memo(({ selectedEmail, aiReply, onGenerateReply }: EmailViewerProps) => (
  <div className="w-1/2 flex flex-col p-4 bg-gray-800">
    {selectedEmail ? (
      <>
        <div className="border-b border-gray-700 pb-4 mb-4">
          <h2 className="text-2xl font-bold text-white">{selectedEmail.subject}</h2>
          <p className="text-sm text-gray-400">From: {selectedEmail.from}</p>
          <p className="text-sm text-gray-400">Date: {new Date(selectedEmail.date).toLocaleString()}</p>
        </div>
        <div className="flex-1 overflow-y-auto whitespace-pre-wrap mb-4 text-gray-300">{selectedEmail.body}</div>
        <div className="border-t border-gray-700 pt-4">
          <h3 className="font-semibold mb-2 text-white">🤖 AI Actions</h3>
          <button onClick={onGenerateReply} disabled={aiReply.loading} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-500">
            {aiReply.loading ? 'Generating...' : 'Generate AI Reply'}
          </button>
          {aiReply.content && (
            <div className="mt-4 p-4 bg-gray-900 rounded-md">
              <h4 className="font-semibold text-white">Suggested Reply:</h4>
              <p className="whitespace-pre-wrap text-gray-300">{aiReply.content}</p>
            </div>
          )}
        </div>
      </>
    ) : <div className="flex items-center justify-center h-full text-gray-500">Select an email to read</div>}
  </div>
));

interface StatsModalProps {
  stats: Stats | null;
  onClose: () => void;
}
const StatsModal = memo(({ stats, onClose }: StatsModalProps) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center text-black z-20" onClick={onClose}>
    <div className="bg-white p-8 rounded-lg w-full max-w-2xl" onClick={e => e.stopPropagation()}>
      <h2 className="text-2xl font-bold mb-4">System Statistics</h2>
      {stats ? (
        <div className="grid grid-cols-2 gap-4">
          <div><h3 className="font-semibold">Email Stats</h3><p>Total Emails: {stats.emails.totalEmails}</p><ul>{Object.entries(stats.emails.categoryCounts).map(([cat, count]) => <li key={cat}>{cat}: {count}</li>)}</ul></div>
          <div><h3 className="font-semibold">AI Status</h3><p>Quota: {stats.ai.quota.calls} / {stats.ai.quota.limit}</p><p>Categorization: {stats.ai.categorizationEnabled ? 'Enabled' : 'Disabled'}</p></div>
          <div className="col-span-2"><h3 className="font-semibold">IMAP Connections</h3><ul>{Object.entries(stats.connections).map(([acc, status]) => <li key={acc}>{acc}: <span className={status ? 'text-green-500' : 'text-red-500'}>{status ? 'Connected' : 'Disconnected'}</span></li>)}</ul></div>
        </div>
      ) : <p>Loading stats...</p>}
      <button onClick={onClose} className="mt-6 bg-blue-500 text-white px-4 py-2 rounded-md">Close</button>
    </div>
  </div>
));

interface ChatWidgetProps {
  isOpen: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}
const ChatWidget = memo(({ isOpen, onToggle, messages, isLoading, inputValue, onInputChange, onSubmit }: ChatWidgetProps) => (
  <>
    <button onClick={onToggle} className="fixed bottom-5 right-5 bg-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center text-3xl shadow-lg z-10">💬</button>
    {isOpen && (
      <div className="fixed bottom-24 right-5 w-96 h-[500px] bg-gray-800 border border-gray-700 rounded-lg shadow-2xl flex flex-col z-10">
        <div className="bg-blue-600 text-white p-4 rounded-t-lg"><h3 className="font-bold">AI Email Assistant</h3></div>
        <div className="flex-1 p-4 overflow-y-auto">
          {messages.map((msg, index) => (
            <div key={index} className={`mb-3 p-3 rounded-lg text-black ${msg.role === 'user' ? 'bg-blue-200 ml-auto' : 'bg-gray-300'}`} style={{ maxWidth: '80%' }}>{msg.content}</div>
          ))}
          {isLoading && <div className="bg-gray-300 text-black p-3 rounded-lg" style={{ maxWidth: '80%' }}>...</div>}
        </div>
        <form onSubmit={onSubmit} className="p-4 border-t border-gray-700">
          <input type="text" value={inputValue} onChange={(e) => onInputChange(e.target.value)} placeholder="Ask about your emails..." className="w-full p-2 border border-gray-600 rounded-md bg-gray-700 text-white" />
        </form>
      </div>
    )}
  </>
));



function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory | 'All'>('All');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [aiReply, setAiReply] = useState<{ content: string; loading: boolean }>({ content: '', loading: false });

  const fetchEmails = useCallback(async (category: EmailCategory | 'All', query = '') => {
    setLoading(true);
    setSelectedEmail(null);
    try {
      let url = `${API_BASE_URL}/api/emails/search?limit=200`;
      if (category !== 'All') { url += `&category=${encodeURIComponent(category)}`; }
      if (query) { url += `&q=${encodeURIComponent(query)}`; }
      const response = await axios.get(url);
      setEmails(response.data.data);
    } catch (error) {
      console.error("Failed to fetch emails:", error);
      alert("Failed to fetch emails. Is the backend server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchEmails(selectedCategory, searchTerm);
    }, 300); // Debounce search
    return () => clearTimeout(handler);
  }, [selectedCategory, searchTerm, fetchEmails]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/stats`);
      setStats(response.data.data);
      setIsStatsModalOpen(true);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      alert("Failed to fetch system stats.");
    }
  }, []);

  const generateAiReply = useCallback(async () => {
    if (!selectedEmail) return;
    setAiReply({ content: '', loading: true });
    try {
      const response = await axios.post(`${API_BASE_URL}/api/emails/${selectedEmail.id}/reply`);
      setAiReply({ content: response.data.data.suggestedReply, loading: false });
    } catch (error) {
      console.error("Failed to generate AI reply:", error);
      setAiReply({ content: 'Error generating reply.', loading: false });
    }
  }, [selectedEmail]);

  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const currentMessage = chatInput;
    if (!currentMessage.trim()) return;

    setChatMessages(prev => [...prev, { role: 'user', content: currentMessage }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/chat`, { message: currentMessage, sessionId: chatSessionId });
      setChatMessages(prev => [...prev, { role: 'model', content: response.data.data.message.content }]);
      setChatSessionId(response.data.data.sessionId);
    } catch (error) {
      console.error("Chat API error:", error);
      setChatMessages(prev => [...prev, { role: 'model', content: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, chatSessionId]);

  const handleSelectEmail = useCallback((email: Email) => {
    setSelectedEmail(email);
    setAiReply({ content: '', loading: false });
  }, []);

  return (
    <div className="h-screen w-screen flex font-sans overflow-hidden">
      <Sidebar selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} onFetchStats={fetchStats} />
      <EmailList emails={emails} loading={loading} selectedEmail={selectedEmail} onSelectEmail={handleSelectEmail} onSearchTermChange={setSearchTerm} />
      <EmailViewer selectedEmail={selectedEmail} aiReply={aiReply} onGenerateReply={generateAiReply} />
      {isStatsModalOpen && <StatsModal stats={stats} onClose={() => setIsStatsModalOpen(false)} />}
      <ChatWidget isOpen={isChatOpen} onToggle={() => setIsChatOpen(prev => !prev)} messages={chatMessages} isLoading={isChatLoading} inputValue={chatInput} onInputChange={setChatInput} onSubmit={handleChatSubmit} />
    </div>
  );
}

export default App;
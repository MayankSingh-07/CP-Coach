import React, { useState, useEffect } from 'react';
import { Send, Bot, User, Code, Lightbulb, GitMerge, ExternalLink } from 'lucide-react';

const ChatInterface = ({ activeWorkspaceProblem }) => {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'coach', text: "Hello! I'm your AI CP Coach. Paste your code on the left, and let me know what problem you're working on. I'll give you progressive hints using our RAG pipeline!" }
  ]);
  const [input, setInput] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('// Paste your code here...\n\n#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}');

  useEffect(() => {
    if (activeWorkspaceProblem) {
      const hasPreviousCode = activeWorkspaceProblem.failed_code && activeWorkspaceProblem.failed_code.trim() !== '';
      
      if (hasPreviousCode) {
        setCodeSnippet(activeWorkspaceProblem.failed_code);
        setMessages([
          { id: 1, sender: 'coach', text: `I see you want to work on "${activeWorkspaceProblem.problem_name}". I have pre-loaded your latest failed code. What part of the logic do you think is failing? Ask me for a hint or click "Analyze Logic" to invoke the AI API.` }
        ]);
      } else {
        setCodeSnippet('// Write your code here...\n\n#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}');
        setMessages([
          { id: 1, sender: 'coach', text: `I see you want to tackle "${activeWorkspaceProblem.problem_name}". You haven't attempted this one yet. Start writing your logic, and ask me for a hint if you get stuck.` }
        ]);
      }
    }
  }, [activeWorkspaceProblem]);

  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = async (messageText) => {
    if (!messageText.trim() || isTyping) return;
    
    const userMsg = { id: Date.now(), sender: 'user', text: messageText };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: messageText,
          problem_id: activeWorkspaceProblem?.id || 'general',
          problem_name: activeWorkspaceProblem?.problem_name || '',
          code: codeSnippet
        })
      });
      
      const data = await response.json();
      
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'coach',
        text: data.response
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'coach',
        text: "Error connecting to AI service. Ensure backend is running."
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex h-full">
      {/* Code Editor & Context */}
      <div className="w-1/2 border-r border-border bg-[#0e0e11] flex flex-col">
        {activeWorkspaceProblem ? (
          <div className="h-auto p-4 border-b border-border bg-surface shrink-0 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded">{activeWorkspaceProblem.rating > 0 ? activeWorkspaceProblem.rating : 'N/A'}</span>
                <span className="text-xs font-bold px-2 py-0.5 bg-surface border border-border text-textMuted rounded uppercase">{activeWorkspaceProblem.tag}</span>
              </div>
              <h2 className="text-lg font-bold text-white">{activeWorkspaceProblem.problem_name}</h2>
            </div>
            <a href={activeWorkspaceProblem.url} target="_blank" rel="noreferrer" className="text-textMuted hover:text-primary transition-colors flex items-center gap-1 text-sm">
              View on Codeforces <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="h-10 border-b border-border flex items-center px-4 bg-surface shrink-0">
            <Code className="w-4 h-4 text-textMuted mr-2" />
            <span className="text-sm font-medium text-textMuted">Editor</span>
          </div>
        )}
        <textarea
          value={codeSnippet}
          onChange={(e) => setCodeSnippet(e.target.value)}
          className="flex-1 w-full bg-transparent text-gray-300 font-mono p-4 focus:outline-none resize-none leading-relaxed"
          spellCheck="false"
        />
        <div className="p-4 border-t border-border bg-surface flex gap-3">
          <button 
            onClick={() => sendMessage('Can you give me a small hint for this problem?')}
            className="flex-1 bg-[#1f1f23] hover:bg-[#27272a] text-sm py-2 rounded border border-border flex items-center justify-center gap-2 transition-colors"
          >
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            Give Hint
          </button>
          <button 
            onClick={() => sendMessage('Can you analyze my logic and tell me where I went wrong?')}
            className="flex-1 bg-[#1f1f23] hover:bg-[#27272a] text-sm py-2 rounded border border-border flex items-center justify-center gap-2 transition-colors"
          >
            <GitMerge className="w-4 h-4 text-blue-400" />
            Analyze Logic
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="w-1/2 flex flex-col bg-surface">
        <div className="h-10 border-b border-border flex items-center px-4 shrink-0 bg-[#1f1f23]">
          <Bot className="w-4 h-4 text-primary mr-2" />
          <span className="text-sm font-medium">AI Coach (RAG Pipeline)</span>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'coach' ? 'bg-primary/20 text-primary' : 'bg-border text-textMuted'}`}>
                {msg.sender === 'coach' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
              </div>
              <div className={`px-4 py-3 rounded-2xl max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-[#1f1f23] border border-border rounded-tl-none'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary/20 text-primary">
                <Bot className="w-5 h-5" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-[#1f1f23] border border-border rounded-tl-none flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-textMuted rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-textMuted rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                <span className="w-1.5 h-1.5 bg-textMuted rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="p-4 border-t border-border">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the problem..."
              className="w-full bg-[#1f1f23] border border-border rounded-full py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-primary transition-colors"
            />
            <button 
              type="submit"
              disabled={!input.trim()}
              className="absolute right-2 top-2 bottom-2 w-8 bg-primary hover:bg-primaryHover text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4 ml-[2px]" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;

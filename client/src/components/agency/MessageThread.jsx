import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getMessages, sendMessage, markMessageAsRead } from '../../api/agency';

/**
 * MessageThread Component
 * Displays conversation thread between agency and talent
 */
export default function MessageThread({ applicationId, talentName }) {
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  // Fetch messages
  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', applicationId],
    queryFn: () => getMessages(applicationId),
    refetchInterval: 10000, // Poll every 10 seconds for new messages
    enabled: !!applicationId
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: ({ message }) => sendMessage(applicationId, message),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries(['messages', applicationId]);
      queryClient.invalidateQueries(['unread-messages']);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send message');
    }
  });

  // Mark messages as read when component mounts or messages change
  useEffect(() => {
    if (messages && messages.length > 0) {
      const unreadMessages = messages.filter(
        (msg) => !msg.is_read && msg.sender_type === 'TALENT'
      );
      // Mark as read (could batch this in a real implementation)
      unreadMessages.forEach((msg) => {
        markMessageAsRead(msg.id);
      });
    }
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (messageText.trim()) {
      sendMutation.mutate({ message: messageText.trim() });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">
          Conversation with {talentName || 'Talent'}
        </h3>
        <p className="text-sm text-gray-500">Messages are visible to talent</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : messages && messages.length > 0 ? (
          <>
            {messages.map((msg) => {
              const isAgency = msg.sender_type === 'AGENCY';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isAgency ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      isAgency
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    <p
                      className={`text-xs mt-1 ${
                        isAgency ? 'text-amber-200' : 'text-gray-500'
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p>No messages yet</p>
              <p className="text-sm mt-1">Start the conversation below</p>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            rows={3}
            disabled={sendMutation.isPending}
          />
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || sendMutation.isPending}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 self-end ${
              messageText.trim() && !sendMutation.isPending
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

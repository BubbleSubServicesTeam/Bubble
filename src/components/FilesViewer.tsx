import { useState, useEffect } from 'react';
import { supabase, Message } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { X, Download, FileText, Image as ImageIcon, File, FileVideo, FileAudio } from 'lucide-react';
import Avatar from './Avatar';

type Props = {
  conversationId: string;
  onClose: () => void;
};

export default function FilesViewer({ conversationId, onClose }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('messages')
      .select('*, sender:profiles!messages_profile_sender_id_fkey(display_name, avatar_url, user_id)')
      .eq('conversation_id', conversationId)
      .in('message_type', ['image', 'file', 'voicemail', 'gif', 'iframe', 'code'])
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setMessages((data as Message[]) ?? []);
        setLoading(false);
      });
  }, [conversationId]);

  function getIcon(type: string) {
    if (type === 'image' || type === 'gif') return <ImageIcon size={18} className="text-sky-400" />;
    if (type === 'voicemail') return <FileAudio size={18} className="text-orange-400" />;
    if (type === 'iframe' || type === 'code') return <FileText size={18} className="text-violet-400" />;
    return <File size={18} className="text-slate-400" />;
  }

  function getDownloadUrl(msg: Message): string | null {
    if (msg.media_url) return msg.media_url;
    if (msg.gif_url) return msg.gif_url;
    return null;
  }

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900 flex-shrink-0" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
            <File size={16} className="text-sky-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-[15px]">All Files</h2>
            <p className="text-slate-400 text-[11px]">{messages.length} items in this chat</p>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <File size={40} className="text-slate-700" />
            <p className="text-slate-500 text-sm">No files shared yet</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-2">
            {messages.map(msg => {
              const url = getDownloadUrl(msg);
              return (
                <div key={msg.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                    {msg.message_type === 'image' && msg.media_url ? (
                      <img src={msg.media_url} alt="" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      getIcon(msg.message_type)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[13px] font-medium truncate">
                      {msg.file_name ?? msg.message_type === 'gif' ? 'GIF' : msg.message_type === 'iframe' ? (msg.file_name ?? 'Embed') : 'File'}
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      {msg.sender?.display_name ?? 'Unknown'} · {new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      {msg.file_size ? ` · ${(msg.file_size / 1024).toFixed(1)} KB` : ''}
                    </p>
                  </div>
                  {url && (
                    <a
                      href={url}
                      download={msg.file_name ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-9 h-9 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 flex items-center justify-center text-sky-400 transition-colors flex-shrink-0"
                      title="Download"
                    >
                      <Download size={16} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

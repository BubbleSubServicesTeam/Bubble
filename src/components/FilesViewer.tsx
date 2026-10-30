import { useState, useEffect } from 'react';
import { supabase, Message } from '../lib/supabase';
import { X, Download, FileText, Image as ImageIcon, File, FileVideo, FileAudio, FileCode, Link2, Music, Film, Archive, FileSpreadsheet, Presentation, FileType } from 'lucide-react';

type Props = {
  conversationId: string;
  onClose: () => void;
};

function getFileExtension(fileName: string | null | undefined, url: string | null | undefined): string {
  if (fileName) {
    const parts = fileName.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  }
  if (url) {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const parts = cleanUrl.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  }
  return '';
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getDisplayName(msg: Message): string {
  switch (msg.message_type) {
    case 'image': return msg.file_name ?? 'Image';
    case 'gif': return msg.file_name ?? 'GIF';
    case 'voicemail': return msg.file_name ?? 'Voice Message';
    case 'file': return msg.file_name ?? 'File';
    case 'code': return msg.file_name ?? `${msg.code_language ?? 'Code'} snippet`;
    case 'iframe': return msg.file_name ?? 'Embed';
    case 'location': return msg.file_name ?? 'Location';
    default: return msg.file_name ?? msg.message_type;
  }
}

function getFileIcon(msg: Message) {
  if (msg.message_type === 'image' || msg.message_type === 'gif') return <ImageIcon size={20} className="text-sky-400" />;
  if (msg.message_type === 'voicemail') return <FileAudio size={20} className="text-orange-400" />;
  if (msg.message_type === 'code' || msg.message_type === 'iframe') return <FileCode size={20} className="text-violet-400" />;
  if (msg.message_type === 'location') return <Link2 size={20} className="text-green-400" />;

  const ext = getFileExtension(msg.file_name, msg.media_url);
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'md', 'pages'];
  const sheetExts = ['xls', 'xlsx', 'csv', 'numbers'];
  const presExts = ['ppt', 'pptx', 'key'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic'];

  if (videoExts.includes(ext)) return <Film size={20} className="text-rose-400" />;
  if (audioExts.includes(ext)) return <Music size={20} className="text-orange-400" />;
  if (archiveExts.includes(ext)) return <Archive size={20} className="text-amber-400" />;
  if (imageExts.includes(ext)) return <ImageIcon size={20} className="text-sky-400" />;
  if (sheetExts.includes(ext)) return <FileSpreadsheet size={20} className="text-green-400" />;
  if (presExts.includes(ext)) return <Presentation size={20} className="text-orange-400" />;
  if (docExts.includes(ext)) return <FileText size={20} className="text-blue-400" />;
  return <File size={20} className="text-slate-400" />;
}

function getTypeBadge(msg: Message): string {
  const ext = getFileExtension(msg.file_name, msg.media_url);
  if (msg.message_type === 'voicemail') return 'AUDIO';
  if (msg.message_type === 'code') return (msg.code_language ?? 'CODE').toUpperCase();
  if (msg.message_type === 'iframe') return 'EMBED';
  if (msg.message_type === 'location') return 'LOCATION';
  if (msg.message_type === 'gif') return 'GIF';
  if (msg.message_type === 'image') return ext ? ext.toUpperCase() : 'IMAGE';
  if (ext) return ext.toUpperCase();
  return msg.message_type.toUpperCase();
}

export default function FilesViewer({ conversationId, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'images' | 'videos' | 'audio' | 'files'>('all');

  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('messages')
      .select('*, sender:profiles!messages_profile_sender_id_fkey(display_name, avatar_url, user_id)')
      .eq('conversation_id', conversationId)
      .in('message_type', ['image', 'file', 'voicemail', 'gif', 'iframe', 'code', 'location'])
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setMessages((data as Message[]) ?? []);
        setLoading(false);
      });
  }, [conversationId]);

  function getDownloadUrl(msg: Message): string | null {
    if (msg.media_url) return msg.media_url;
    if (msg.gif_url) return msg.gif_url;
    return null;
  }

  const filtered = messages.filter(msg => {
    if (filter === 'all') return true;
    if (filter === 'images') return msg.message_type === 'image' || msg.message_type === 'gif';
    if (filter === 'videos') {
      const ext = getFileExtension(msg.file_name, msg.media_url);
      return ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(ext);
    }
    if (filter === 'audio') return msg.message_type === 'voicemail';
    if (filter === 'files') return msg.message_type === 'file' || msg.message_type === 'code' || msg.message_type === 'iframe';
    return true;
  });

  const filters: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: messages.length },
    { id: 'images', label: 'Photos', count: messages.filter(m => m.message_type === 'image' || m.message_type === 'gif').length },
    { id: 'videos', label: 'Videos', count: messages.filter(m => ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(getFileExtension(m.file_name, m.media_url))).length },
    { id: 'audio', label: 'Audio', count: messages.filter(m => m.message_type === 'voicemail').length },
    { id: 'files', label: 'Documents', count: messages.filter(m => m.message_type === 'file' || m.message_type === 'code' || m.message_type === 'iframe').length },
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900 flex-shrink-0" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
            <FileType size={16} className="text-sky-400" />
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

      {/* Filter tabs */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-900/50 border-b border-white/5 overflow-x-auto scrollbar-thin">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all ${
              filter === f.id ? 'bg-sky-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {f.label}
            {f.count > 0 && <span className={`text-[10px] ${filter === f.id ? 'text-white/70' : 'text-slate-600'}`}>{f.count}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <File size={40} className="text-slate-700" />
            <p className="text-slate-500 text-sm">No files shared yet</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-2">
            {filtered.map(msg => {
              const url = getDownloadUrl(msg);
              const size = formatFileSize(msg.file_size);
              const badge = getTypeBadge(msg);
              return (
                <div key={msg.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-all">
                  <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {msg.message_type === 'image' && msg.media_url ? (
                      <img src={msg.media_url} alt="" className="w-full h-full object-cover rounded-xl" loading="lazy" />
                    ) : msg.message_type === 'gif' && msg.gif_url ? (
                      <img src={msg.gif_url} alt="" className="w-full h-full object-cover rounded-xl" loading="lazy" />
                    ) : (
                      getFileIcon(msg)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white text-[13px] font-medium truncate flex-1">{getDisplayName(msg)}</p>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300 flex-shrink-0">{badge}</span>
                    </div>
                    <p className="text-slate-500 text-[11px] flex items-center gap-1.5">
                      <span className="truncate">{msg.sender?.display_name ?? 'Unknown'}</span>
                      <span>·</span>
                      <span className="flex-shrink-0">{new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      {size && (<><span>·</span><span className="flex-shrink-0">{size}</span></>)}
                    </p>
                  </div>
                  {url && (
                    <a
                      href={url}
                      download={msg.file_name ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 flex items-center justify-center text-sky-400 transition-colors flex-shrink-0 active:scale-90"
                      title="Download"
                    >
                      <Download size={18} />
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

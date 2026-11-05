import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase, GIF, Conversation, GifCollection } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Avatar from './Avatar';
import { X, Upload, Trash2, Send, Search, Sparkles, Film, Scissors, Users } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Props = {
  onClose: () => void;
  conversations: Conversation[];
  onShareGif: (convId: string, gifId: string) => Promise<void>;
};

type Tab = 'mine' | 'share' | 'shared';
type SharedCollection = GifCollection & { gif_collection_items?: { gif: GIF | null }[] };

export default function GifStudio({ onClose, conversations, onShareGif }: Props) {
  const { user } = useAuth();
  const [myGifs, setMyGifs] = useState<GIF[]>([]);
  const [sharedCollections, setSharedCollections] = useState<SharedCollection[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<Tab>('mine');
  const [shareSearch, setShareSearch] = useState('');
  const [selectedGif, setSelectedGif] = useState<GIF | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pendingVideo, setPendingVideo] = useState<{ file: File; url: string; duration: number } | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimDuration] = useState(6);
  const [trimming, setTrimming] = useState(false);

  const loadSharedGifs = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('gif_collections')
      .select('id, name, conversation_id, created_by, is_group_collection, created_at, gif_collection_items(gif:gifs(id, creator_id, title, url, thumbnail_url, tags, width, height, is_public, created_at))')
      .not('conversation_id', 'is', null)
      .order('created_at', { ascending: false });
    if (!error) setSharedCollections((data as SharedCollection[]) ?? []);
  }, [user]);

  const loadGifs = useCallback(async () => {
    if (!user) return;
    setLoadingGifs(true);
    try {
      const { data, error } = await supabase
        .from('gifs')
        .select('id, title, url, thumbnail_url, tags, created_at')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      setMyGifs((data as GIF[]) ?? []);
    } catch (err) {
      console.error('Failed to load GIFs:', err);
      setMyGifs([]);
    } finally {
      setLoadingGifs(false);
    }
  }, [user]);

  useEffect(() => {
    loadGifs();
    loadSharedGifs();
  }, [loadGifs, loadSharedGifs]);

  async function handleUpload(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'gif';
      const fileName = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('gifs')
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('gifs').getPublicUrl(fileName);
      const url = urlData.publicUrl;

      const { error: gifError } = await supabase.from('gifs').insert({
        creator_id: user.id,
        title: file.name.replace(/\.[^/.]+$/, ''),
        url,
        thumbnail_url: url,
        tags: [],
      });

      if (gifError) throw gifError;
      await loadGifs();
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelected(file: File) {
    if (isVideoFile(file)) {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      video.onloadedmetadata = () => {
        setPendingVideo({ file, url, duration: video.duration });
        setTrimStart(0);
      };
    } else {
      handleUpload(file);
    }
  }

  function isVideoFile(file: File): boolean {
    return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(file.name);
  }

  async function trimAndUpload() {
    if (!pendingVideo || !videoRef.current) return;
    setTrimming(true);
    try {
      const video = videoRef.current;
      video.currentTime = trimStart;

      await new Promise<void>((resolve) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

      const startSec = Math.floor(trimStart);
      const ext = pendingVideo.file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
      const trimmedName = `trim_${startSec}s_${trimDuration}s.${ext}`;
      const trimmedFile = new File([pendingVideo.file], trimmedName, { type: pendingVideo.file.type });

      const fileName = `${user?.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('gifs')
        .upload(fileName, trimmedFile, { contentType: pendingVideo.file.type, upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('gifs').getPublicUrl(fileName);
      const url = urlData.publicUrl;

      const { error: gifError } = await supabase.from('gifs').insert({
        creator_id: user?.id,
        title: pendingVideo.file.name.replace(/\.[^/.]+$/, ''),
        url,
        thumbnail_url: thumbnail,
        tags: [],
      });

      if (gifError) throw gifError;

      URL.revokeObjectURL(pendingVideo.url);
      setPendingVideo(null);
      await loadGifs();
    } catch (err) {
      console.error('Trim/upload failed:', err);
      alert('Failed to process video. Try a different file.');
    } finally {
      setTrimming(false);
    }
  }

  function cancelTrim() {
    if (pendingVideo) URL.revokeObjectURL(pendingVideo.url);
    setPendingVideo(null);
    setTrimStart(0);
  }

  async function handleDelete(gifId: string) {
    try {
      await supabase.from('gifs').delete().eq('id', gifId);
      setMyGifs(prev => prev.filter(g => g.id !== gifId));
      if (selectedGif?.id === gifId) setSelectedGif(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  const filteredConvs = conversations.filter(c => {
    if (c.is_self_chat) return false;
    const q = shareSearch.toLowerCase();
    if (!q) return true;
    if (c.name?.toLowerCase().includes(q)) return true;
    if (c.members) {
      return c.members.some(m => m.display_name?.toLowerCase().includes(q));
    }
    return false;
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-2xl mx-4 overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Sparkles size={16} className="text-slate-900 dark:text-white" />
            </div>
            <h2 className="text-slate-900 dark:text-white font-bold text-lg">GIF Studio</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-3 gap-1">
          <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')}>
            <Film size={14} />
            My GIFs
          </TabBtn>
          <TabBtn active={tab === 'share'} onClick={() => setTab('share')}>
            <Send size={14} />
            Share Access
          </TabBtn>
          <TabBtn active={tab === 'shared'} onClick={() => { setTab('shared'); loadSharedGifs(); }}>
            <Users size={14} />
            Shared GIFs
          </TabBtn>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {tab === 'mine' && (
            <>
              {/* Upload area or video trimmer */}
              {pendingVideo ? (
                <div className="mb-4 space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-200 dark:border-white/10">
                    <video
                      ref={videoRef}
                      src={pendingVideo.url}
                      className="w-full max-h-[300px] object-contain"
                      playsInline
                      controls
                    />
                  </div>
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                    <Scissors size={16} className="text-sky-400" />
                    <span className="text-sm font-medium">Trim to 6 seconds</span>
                    <span className="text-xs text-slate-500 ml-auto">
                      Start: {trimStart.toFixed(1)}s — End: {Math.min(trimStart + trimDuration, pendingVideo.duration).toFixed(1)}s
                    </span>
                  </div>
                  <div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, pendingVideo.duration - trimDuration)}
                      step={0.1}
                      value={trimStart}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        setTrimStart(v);
                        if (videoRef.current) videoRef.current.currentTime = v;
                      }}
                      className="w-full accent-sky-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>0s</span>
                      <span>{pendingVideo.duration.toFixed(1)}s total</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={trimAndUpload}
                      disabled={trimming}
                      className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 text-white font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {trimming ? <BubbleLoader size={18} /> : <><Scissors size={14} /> Trim & Upload</>}
                    </button>
                    <button
                      onClick={cancelTrim}
                      className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-medium text-sm rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 mb-4 text-center hover:border-sky-500/30 transition-all cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/gif,image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelected(file);
                      e.target.value = '';
                    }}
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <BubbleLoader size={36} />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">Uploading...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
                        <Upload size={20} className="text-slate-500 dark:text-slate-400" />
                      </div>
                      <p className="text-slate-400 text-sm font-medium">Upload a GIF, image, or video</p>
                      <p className="text-slate-600 text-xs">Click to browse · GIF, PNG, JPG, MP4, WebM, MOV</p>
                    </div>
                  )}
                </div>
              )}

              {/* GIF grid */}
              {loadingGifs ? (
                <div className="flex items-center justify-center py-12">
                  <BubbleLoader size={40} />
                </div>
              ) : myGifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
                    <Film size={20} className="text-slate-400 dark:text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm">No GIFs yet. Upload one above!</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {myGifs.map(gif => (
                    <div
                      key={gif.id}
                      className="group relative bg-black rounded-xl overflow-hidden border border-slate-200 dark:border-white/5 hover:border-white/15 transition-all"
                    >
                      <GifMedia src={gif.url} alt={gif.title} />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => { setSelectedGif(gif); setTab('share'); }}
                          className="w-9 h-9 rounded-full bg-sky-500 hover:bg-sky-400 flex items-center justify-center transition-all"
                          title="Share"
                        >
                          <Send size={15} className="text-slate-900 dark:text-white" />
                        </button>
                        <button
                          onClick={() => handleDelete(gif.id)}
                          className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center transition-all"
                          title="Delete"
                        >
                          <Trash2 size={15} className="text-slate-900 dark:text-white" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'share' && (
            <>
              {selectedGif ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-black border border-slate-200 dark:border-white/5">
                      <GifMedia src={selectedGif.url} alt={selectedGif.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 dark:text-white font-medium text-sm truncate">{selectedGif.title}</p>
                      <button
                        onClick={() => setSelectedGif(null)}
                        className="text-sky-400 hover:text-sky-300 text-xs font-medium mt-1"
                      >
                        Choose a different GIF
                      </button>
                    </div>
                  </div>

                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-2">Give access to</p>
                  <div className="relative mb-3">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search conversations..."
                      value={shareSearch}
                      onChange={e => setShareSearch(e.target.value)}
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.05] rounded-xl pl-8 pr-3 py-2 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500/40 transition-all"
                    />
                  </div>

                  <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin">
                    {filteredConvs.length === 0 ? (
                      <p className="text-slate-600 text-sm text-center py-8">No conversations found</p>
                    ) : (
                      filteredConvs.map(conv => (
                        <button
                          key={conv.id}
                          onClick={async () => {
                            if (!selectedGif) return;
                            await onShareGif(conv.id, selectedGif.id);
                            setSelectedGif(null);
                            setShareSearch('');
                            onClose();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:bg-white/[0.04] transition-all text-left group"
                        >
                          <div className="flex-shrink-0">
                            {conv.is_group ? (
                              conv.avatar_url ? (
                                <img src={conv.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                                  <span className="text-slate-900 dark:text-white font-bold text-xs">
                                    {(conv.name ?? 'G').charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )
                            ) : (
                              <Avatar
                                profile={conv.members?.find(m => m.user_id !== user?.id) ?? null}
                                size="sm"
                                showStatus
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {conv.is_group ? conv.name ?? 'Group Chat' : 'Direct message'}
                            </p>
                          </div>
                          <Send size={14} className="text-slate-600 group-hover:text-sky-400 transition-colors flex-shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
                    <Send size={20} className="text-slate-400 dark:text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm">Go to "My GIFs" and select a GIF to share</p>
                  <button
                    onClick={() => setTab('mine')}
                    className="text-sky-400 hover:text-sky-300 text-sm font-medium"
                  >
                    Browse my GIFs
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'shared' && (
            <div className="space-y-5">
              {sharedCollections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
                    <Users size={20} className="text-slate-400 dark:text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm">No GIFs have been shared with you yet</p>
                </div>
              ) : sharedCollections.map(collection => {
                const gifs = (collection.gif_collection_items ?? []).map(item => item.gif).filter((gif): gif is GIF => Boolean(gif));
                if (gifs.length === 0) return null;
                return (
                  <section key={collection.id}>
                    <p className="text-slate-900 dark:text-white text-sm font-semibold mb-2">{collection.name}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {gifs.map(gif => <div key={gif.id} className="bg-black rounded-xl overflow-hidden border border-slate-200 dark:border-white/5"><GifMedia src={gif.url} alt={gif.title} /></div>)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-[13px] font-medium transition-all ${
        active ? 'text-white bg-slate-100 dark:bg-white/[0.04]' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

export function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
    lower.endsWith('.m4v') || lower.endsWith('.avi') || lower.endsWith('.mkv') ||
    lower.includes('/video/') || lower.includes('media_formats/mp4');
}

export function GifMedia({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className={className ?? 'w-full aspect-square object-cover'}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={className ?? 'w-full aspect-square object-cover'}
      loading="lazy"
    />
  );
}

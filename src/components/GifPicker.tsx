import { useState, useEffect } from 'react';
import { supabase, GIF, GifCollection } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { GifMedia, isVideoUrl } from './GifStudio';
import { X, Search, Layers, ChevronRight, Plus, ExternalLink, Sparkles } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Props = {
  onSelect: (url: string) => void;
  onClose: () => void;
  conversationId: string;
  onOpenStudio: () => void;
};

const GIPHY_KEY = '8blk9mlVWTo1kGAN49Lb7ffA3BtlAJib';

export default function GifPicker({ onSelect, onClose, conversationId, onOpenStudio }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'trending' | 'search' | 'my' | 'collections'>('trending');
  const [search, setSearch] = useState('');
  const [tenorGifs, setTenorGifs] = useState<{ url: string; preview: string; id: string }[]>([]);
  const [myGifs, setMyGifs] = useState<GIF[]>([]);
  const [collections, setCollections] = useState<GifCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<GifCollection | null>(null);
  const [collectionGifs, setCollectionGifs] = useState<GIF[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === 'trending') fetchTrending();
    if (tab === 'my') fetchMyGifs();
    if (tab === 'collections') fetchCollections();
  }, [tab]);

  useEffect(() => {
    if (tab === 'search' && search.trim()) {
      const t = setTimeout(() => searchTenor(search), 400);
      return () => clearTimeout(t);
    }
  }, [search, tab]);

  async function fetchTrending() {
    setLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=g`);
      const data = await res.json();
      if (data.data) {
        setTenorGifs(data.data.map((g: any) => ({
          id: g.id,
          url: g.images?.original?.mp4 ?? g.images?.original?.url ?? g.images?.downsized?.url ?? '',
          preview: g.images?.fixed_height_small?.mp4 ?? g.images?.fixed_height_small?.url ?? g.images?.downsized_small?.url ?? '',
        })).filter((g: any) => g.url));
      }
    } catch {
      setTenorGifs([]);
    }
    setLoading(false);
  }

  async function searchTenor(q: string) {
    setLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=g`);
      const data = await res.json();
      if (data.data) {
        setTenorGifs(data.data.map((g: any) => ({
          id: g.id,
          url: g.images?.original?.mp4 ?? g.images?.original?.url ?? g.images?.downsized?.url ?? '',
          preview: g.images?.fixed_height_small?.mp4 ?? g.images?.fixed_height_small?.url ?? g.images?.downsized_small?.url ?? '',
        })).filter((g: any) => g.url));
      }
    } catch { setTenorGifs([]); }
    setLoading(false);
  }

  async function fetchMyGifs() {
    if (!user) return;
    const { data } = await supabase.from('gifs').select('*').eq('creator_id', user.id).order('created_at', { ascending: false });
    if (data) setMyGifs(data as GIF[]);
  }

  async function fetchCollections() {
    const { data } = await supabase
      .from('gif_collections')
      .select('*')
      .or(`created_by.eq.${user?.id},conversation_id.eq.${conversationId}`)
      .order('created_at', { ascending: false });
    if (data) setCollections(data as GifCollection[]);
  }

  async function openCollection(coll: GifCollection) {
    setSelectedCollection(coll);
    const { data } = await supabase
      .from('gif_collection_items')
      .select('gifs(*)')
      .eq('collection_id', coll.id);
    if (data) setCollectionGifs(data.map((item: any) => item.gifs).filter(Boolean) as GIF[]);
  }

  async function createGroupCollection() {
    if (!user) return;
    const name = prompt('Collection name:');
    if (!name?.trim()) return;
    await supabase.from('gif_collections').insert({
      name: name.trim(),
      conversation_id: conversationId,
      created_by: user.id,
      is_group_collection: true,
    });
    fetchCollections();
  }

  async function addToCollection(collId: string, gifId: string) {
    if (!user) return;
    await supabase.from('gif_collection_items').insert({ collection_id: collId, gif_id: gifId, added_by: user.id });
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden" style={{ height: '400px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-sky-400" />
          <span className="text-slate-900 dark:text-white font-semibold text-sm">GIFs</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenStudio}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-medium transition-all"
          >
            <Plus size={12} />
            Create GIF
          </button>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/5 px-4">
        {(['trending', 'search', 'my', 'collections'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedCollection(null); }}
            className={`px-3 py-2 text-xs font-medium capitalize transition-all border-b-2 -mb-px ${
              tab === t ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t === 'my' ? 'My GIFs' : t}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {(tab === 'trending' || tab === 'search') && (
        <div className="px-4 py-2 border-b border-slate-200 dark:border-white/5">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search GIFs..."
              value={search}
              onChange={e => { setSearch(e.target.value); setTab('search'); }}
              className="w-full bg-slate-100 dark:bg-white/5 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="overflow-y-auto scrollbar-thin" style={{ height: 'calc(400px - 120px)' }}>
        {/* Tenor GIFs */}
        {(tab === 'trending' || tab === 'search') && (
          <div className="p-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <BubbleLoader size={36} />
              </div>
            ) : (
              <div className="columns-3 gap-1">
                {tenorGifs.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => onSelect(gif.url)}
                    className="w-full mb-1 rounded-xl overflow-hidden hover:ring-2 hover:ring-sky-500 transition-all"
                  >
                    <GifMedia src={gif.preview} alt="" className="w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My GIFs */}
        {tab === 'my' && (
          <div className="p-2">
            {myGifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <p className="text-slate-500 text-sm">No GIFs yet</p>
                <button
                  onClick={onOpenStudio}
                  className="px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-xl text-xs font-medium transition-all"
                >
                  Create your first GIF
                </button>
              </div>
            ) : (
              <div className="columns-3 gap-1">
                {myGifs.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => onSelect(gif.url)}
                    className="w-full mb-1 rounded-xl overflow-hidden hover:ring-2 hover:ring-sky-500 transition-all"
                  >
                    <GifMedia src={gif.url} alt={gif.title} className="w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collections */}
        {tab === 'collections' && !selectedCollection && (
          <div className="p-2">
            <button
              onClick={createGroupCollection}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-sm text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all mb-2"
            >
              <Plus size={14} className="text-sky-400" />
              New group collection
            </button>
            {collections.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-4">No collections yet</p>
            ) : (
              <div className="space-y-1">
                {collections.map(coll => (
                  <button
                    key={coll.id}
                    onClick={() => openCollection(coll)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-100 dark:bg-white/5 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-sky-400" />
                      <span className="text-sm text-slate-900 dark:text-white">{coll.name}</span>
                      {coll.is_group_collection && (
                        <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full">Group</span>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-slate-500 dark:text-slate-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collection detail */}
        {tab === 'collections' && selectedCollection && (
          <div className="p-2">
            <button
              onClick={() => setSelectedCollection(null)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white mb-3 px-2 transition-colors"
            >
              <ChevronRight size={14} className="rotate-180" />
              {selectedCollection.name}
            </button>
            {collectionGifs.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-4">No GIFs in this collection</p>
            ) : (
              <div className="columns-3 gap-1">
                {collectionGifs.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => onSelect(gif.url)}
                    className="w-full mb-1 rounded-xl overflow-hidden hover:ring-2 hover:ring-sky-500 transition-all"
                  >
                    <img src={gif.url} alt={gif.title} className="w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

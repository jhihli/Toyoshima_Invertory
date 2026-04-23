/* Root app: navigation + routing */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "sidebarCollapsed": false
}/*EDITMODE-END*/;

const loadState = () => {
  try {
    const raw = localStorage.getItem('wh_state');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { page: 'dashboard', soId: null, boardId: null };
};

const App = () => {
  const init = loadState();
  const [page, setPage] = useState(init.page || 'dashboard');
  const [soId, setSoId] = useState(init.soId || null);
  const [boardId, setBoardId] = useState(init.boardId || null);
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('wh_state', JSON.stringify({ page, soId, boardId }));
  }, [page, soId, boardId]);

  // Tweaks plumbing
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setTweaksOpen(true);
      if (d.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweak = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };

  const openSO = (id) => { setSoId(id); setPage('so_detail'); };
  const openBoard = (id) => { setBoardId(id); setPage('board_detail'); };
  const nav = (p) => {
    if (p === 'sos') { setPage('sos'); return; }
    setPage(p);
  };

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}
        data-screen-label={pageLabel(page)}>
        <Sidebar page={page} onNav={nav} collapsed={tweaks.sidebarCollapsed} />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <TopBar onToggleSidebar={() => setTweak('sidebarCollapsed', !tweaks.sidebarCollapsed)} />
          <div style={{ flex: 1 }}>
            {page === 'dashboard'    && <DashboardPage onNav={nav} onOpenSO={openSO} />}
            {page === 'sos'          && <SOListPage onOpen={openSO} onNavDashboard={() => setPage('dashboard')} />}
            {page === 'so_detail'    && <SODetailPage soId={soId}
              onBack={() => setPage('sos')} onOpenBoard={openBoard} />}
            {page === 'board_detail' && <BoardDetailPage boardId={boardId}
              onBack={() => setPage('sos')}
              onBackToSO={(id) => { setSoId(id); setPage('so_detail'); }} />}
            {page === 'vendors'      && <VendorsPage />}
            {page === 'chipbrands'   && <ChipBrandsPage />}
            {page === 'settings'     && <SettingsPage />}
          </div>
        </main>
        <TweaksPanel open={tweaksOpen}
          collapsed={tweaks.sidebarCollapsed}
          onCollapsed={(v) => setTweak('sidebarCollapsed', v)} />
      </div>
    </ToastProvider>
  );
};

const pageLabel = (p) => ({
  dashboard: 'Dashboard', sos: 'SO List', so_detail: 'SO Detail',
  board_detail: 'Board Detail', vendors: 'Vendors', chipbrands: 'Chip Brands',
  settings: 'Settings'
}[p] || p);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

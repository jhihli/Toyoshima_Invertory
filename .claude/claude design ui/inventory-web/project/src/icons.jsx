// Minimal hairline icons - 1.25 stroke, consistent 16px viewBox
const Icon = ({ d, size = 16, stroke = 1.25, fill = 'none', children, style }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  Dashboard:  (p) => <Icon {...p}><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="9" y="2" width="5" height="3" rx="0.5"/><rect x="9" y="7" width="5" height="7" rx="0.5"/><rect x="2" y="9" width="5" height="5" rx="0.5"/></Icon>,
  SO:         (p) => <Icon {...p}><path d="M3 2h7l3 3v9H3z"/><path d="M10 2v3h3"/><path d="M5.5 8.5h5M5.5 11h5"/></Icon>,
  Vendor:     (p) => <Icon {...p}><path d="M2 6l1-3h10l1 3"/><path d="M2 6v7h12V6"/><path d="M5 13v-3h3v3"/><path d="M2 6h12"/></Icon>,
  Chip:       (p) => <Icon {...p}><rect x="4" y="4" width="8" height="8" rx="0.5"/><path d="M6 1v2M8 1v2M10 1v2M6 13v2M8 13v2M10 13v2M1 6h2M1 8h2M1 10h2M13 6h2M13 8h2M13 10h2"/></Icon>,
  Settings:   (p) => <Icon {...p}><circle cx="8" cy="8" r="1.8"/><path d="M8 1v2M8 13v2M15 8h-2M3 8H1M13 3l-1.5 1.5M4.5 11.5L3 13M13 13l-1.5-1.5M4.5 4.5L3 3"/></Icon>,
  Search:     (p) => <Icon {...p}><circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/></Icon>,
  Bell:       (p) => <Icon {...p}><path d="M4 7a4 4 0 1 1 8 0v3l1.5 2h-11L4 10z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></Icon>,
  Plus:       (p) => <Icon {...p}><path d="M8 3v10M3 8h10"/></Icon>,
  Minus:      (p) => <Icon {...p}><path d="M3 8h10"/></Icon>,
  Chevron:    (p) => <Icon {...p}><path d="M6 4l4 4-4 4"/></Icon>,
  ChevronDown:(p) => <Icon {...p}><path d="M4 6l4 4 4-4"/></Icon>,
  ChevronUp:  (p) => <Icon {...p}><path d="M4 10l4-4 4 4"/></Icon>,
  Close:      (p) => <Icon {...p}><path d="M3 3l10 10M13 3L3 13"/></Icon>,
  Check:      (p) => <Icon {...p}><path d="M3 8l3.5 3.5L13 5"/></Icon>,
  Edit:       (p) => <Icon {...p}><path d="M10 3l3 3-7 7H3v-3z"/></Icon>,
  Trash:      (p) => <Icon {...p}><path d="M3 4h10M6 4V2h4v2M5 4l.5 9h5L11 4"/></Icon>,
  Upload:     (p) => <Icon {...p}><path d="M8 2v9M5 5l3-3 3 3M3 13h10"/></Icon>,
  Download:   (p) => <Icon {...p}><path d="M8 2v9M5 8l3 3 3-3M3 13h10"/></Icon>,
  Filter:     (p) => <Icon {...p}><path d="M2 3h12l-4.5 6v4l-3 1v-5z"/></Icon>,
  Calendar:   (p) => <Icon {...p}><rect x="2" y="3" width="12" height="11" rx="0.5"/><path d="M2 6h12M5 1.5V4M11 1.5V4"/></Icon>,
  More:       (p) => <Icon {...p}><circle cx="3.5" cy="8" r=".6" fill="currentColor"/><circle cx="8" cy="8" r=".6" fill="currentColor"/><circle cx="12.5" cy="8" r=".6" fill="currentColor"/></Icon>,
  Home:       (p) => <Icon {...p}><path d="M2 7l6-5 6 5v7H2z"/><path d="M6 14V9h4v5"/></Icon>,
  Image:      (p) => <Icon {...p}><rect x="2" y="2" width="12" height="12" rx="0.5"/><circle cx="6" cy="6" r="1"/><path d="M2 11l3-3 3 3 2-2 4 4"/></Icon>,
  Box:        (p) => <Icon {...p}><path d="M8 1.5l6 3v7l-6 3-6-3v-7z"/><path d="M2 4.5l6 3 6-3M8 7.5v7"/></Icon>,
  Package:    (p) => <Icon {...p}><rect x="2" y="5" width="12" height="9" rx="0.5"/><path d="M2 5l2-3h8l2 3M8 5v9M5 8h6"/></Icon>,
  ArrowRight: (p) => <Icon {...p}><path d="M3 8h10M9 4l4 4-4 4"/></Icon>,
  Menu:       (p) => <Icon {...p}><path d="M2 4h12M2 8h12M2 12h12"/></Icon>,
  PanelLeft:  (p) => <Icon {...p}><rect x="2" y="3" width="12" height="10" rx="0.5"/><path d="M6 3v10"/></Icon>,
};

window.Icons = Icons;
window.Icon = Icon;

import type { SVGProps } from "react";

function base(children: React.ReactNode, props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export const GridIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>, p);

export const ExternalLinkIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>, p);

export const FileIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>, p);

export const HomeIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>, p);

export const CalendarIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>, p);

export const SearchIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>, p);

export const ChartIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>, p);

export const SettingsIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, p);

export const MoonIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />, p);
export const SunIcon = (p: SVGProps<SVGSVGElement>) => base(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>, p);
export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M6 9l6 6 6-6" />, p);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M18 6 6 18M6 6l12 12" />, p);
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M12 5v14M5 12h14" />, p);
export const UploadIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />, p);
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />, p);
export const EditIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>, p);
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => base(<polyline points="20 6 9 17 4 12" />, p);
export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M15 6l-6 6 6 6" />, p);
export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M9 6l6 6-6 6" />, p);
export const AlertIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>, p);
export const ClockIcon = (p: SVGProps<SVGSVGElement>) => base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>, p);
export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>, p);
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => base(<><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>, p);
export const MoreIcon = (p: SVGProps<SVGSVGElement>) => base(<><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></>, p);
export const BellIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>, p);
export const UserIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>, p);
export const FilterIcon = (p: SVGProps<SVGSVGElement>) => base(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />, p);
export const DownloadIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>, p);
export const FileSpreadsheetIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /><line x1="12" y1="13" x2="12" y2="21" /></>, p);
export const FilePdfIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="13" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /><line x1="8" y1="21" x2="12" y2="21" /></>, p);
export const RefreshIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" /></>, p);
export const InfoIcon = (p: SVGProps<SVGSVGElement>) => base(<><circle cx="12" cy="12" r="9" /><line x1="12" y1="16" x2="12" y2="11" /><line x1="12" y1="8" x2="12.01" y2="8" /></>, p);
export const WalletIcon = (p: SVGProps<SVGSVGElement>) =>
  base(<><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /><path d="M18 12a2 2 0 0 0 0 4h3v-4z" /></>, p);
export const SendIcon = (p: SVGProps<SVGSVGElement>) => base(<><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>, p);
export const MessageIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />, p);
export const SmileIcon = (p: SVGProps<SVGSVGElement>) => base(<><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></>, p);
export const PinIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /></>, p);
export const ReplyIcon = (p: SVGProps<SVGSVGElement>) => base(<><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>, p);
export const ImageIcon = (p: SVGProps<SVGSVGElement>) => base(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>, p);
export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => base(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, p);
export const MegaphoneIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M3 11v3a1 1 0 0 0 1 1h1l4 5v-6" /><path d="M9 9l9-5v16l-9-5" /><path d="M18 9a3 3 0 0 1 0 6" /></>, p);
export const SpeakerIcon = (p: SVGProps<SVGSVGElement>) => base(<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></>, p);
export const SpeakerMuteIcon = (p: SVGProps<SVGSVGElement>) => base(<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>, p);
export const SparkleIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2.5c.4 3.6 1.1 6 2.3 7.2S18 11.6 21.5 12c-3.6.4-6 1.1-7.2 2.3S12.4 18 12 21.5c-.4-3.6-1.1-6-2.3-7.2S6 12.4 2.5 12c3.6-.4 6-1.1 7.2-2.3S11.6 6 12 2.5Z" />
  </svg>
);
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => base(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, p);
export const ShareIcon = (p: SVGProps<SVGSVGElement>) => base(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="10.6" x2="15.4" y2="6.4" /><line x1="8.6" y1="13.4" x2="15.4" y2="17.6" /></>, p);
export const TrophyIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M7 5H4a1 1 0 0 0-1 1c0 2.5 1.5 4 4 4.3M17 5h3a1 1 0 0 1 1 1c0 2.5-1.5 4-4 4.3" /></>, p);
export const RocketIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 19 2c0 2.52-.6 6.7-4 10a22.35 22.35 0 0 1-3 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></>, p);
export const SunriseIcon = (p: SVGProps<SVGSVGElement>) => base(<><path d="M12 3v5M4.2 10.2l1.4 1.4M18.4 11.6l1.4-1.4M2 18h2M20 18h2M6 18a6 6 0 0 1 12 0" /><line x1="12" y1="18" x2="12" y2="18" /><line x1="8" y1="21" x2="16" y2="21" /></>, p);

// Replaced next/font/google (requires network access) with system font stacks.
// These objects match the shape of Next.js font objects used throughout the app.
export const inter = {
    className: 'font-sans',
    variable: '--font-inter',
    style: { fontFamily: "'Segoe UI', Arial, sans-serif" },
} as const;

export const lusitana = {
    className: 'font-serif',
    variable: '--font-lusitana',
    style: { fontFamily: "Georgia, 'Times New Roman', serif" },
} as const;
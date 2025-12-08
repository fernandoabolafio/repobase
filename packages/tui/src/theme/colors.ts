/**
 * Repobase TUI Color System
 * 
 * A cohesive dark theme designed for terminal interfaces.
 * Inspired by warm dark themes with a modern, professional feel.
 */

/**
 * Base palette - raw color values
 * Use semantic tokens below for actual component styling
 */
const palette = {
  // Neutrals - warm dark tones
  neutral: {
    900: "#0f0e0c",  // Deepest background
    800: "#181714",  // Main background
    700: "#1f1d19",  // Elevated surfaces (modals, cards)
    600: "#28251f",  // Higher elevation
    500: "#353128",  // Borders, dividers
    400: "#4d4840",  // Muted borders
    300: "#6b645a",  // Disabled text, subtle elements
    200: "#8c867c",  // Secondary text
    100: "#b8b3a9",  // Tertiary text
    50:  "#e8e6e1",  // Primary text
  },
  
  // Primary - teal/cyan accent
  primary: {
    900: "#0a2e2e",
    800: "#0f4444",
    700: "#156363",
    600: "#1a8282",
    500: "#20a1a1",  // Main primary
    400: "#3dbdbd",
    300: "#66cfcf",
    200: "#99e0e0",
    100: "#ccf0f0",
  },
  
  // Success - warm green
  success: {
    900: "#0a2912",
    800: "#12431f",
    700: "#1a5d2c",
    600: "#227739",
    500: "#2a9146",  // Main success
    400: "#4fb36a",
    300: "#7acc91",
    200: "#a6e0b5",
    100: "#d3f0da",
  },
  
  // Warning - amber/gold
  warning: {
    900: "#2e1f05",
    800: "#4d3408",
    700: "#6b490c",
    600: "#8a5e0f",
    500: "#a87312",  // Main warning
    400: "#c99428",
    300: "#ddb555",
    200: "#ebd08a",
    100: "#f5e8c4",
  },
  
  // Error - warm red
  error: {
    900: "#2e0a0a",
    800: "#4d1212",
    700: "#751a1a",
    600: "#9e2323",
    500: "#c72b2b",  // Main error
    400: "#db4f4f",
    300: "#e87a7a",
    200: "#f2a6a6",
    100: "#fad3d3",
  },
  
  // Info - blue
  info: {
    900: "#0a1a2e",
    800: "#122b4d",
    700: "#1a3d6b",
    600: "#234f8a",
    500: "#2b61a8",  // Main info
    400: "#4f84c7",
    300: "#7aa6db",
    200: "#a6c8eb",
    100: "#d3e4f5",
  },
} as const

/**
 * Semantic color tokens - use these in components
 */
export const colors = {
  // Background colors
  bg: {
    base: palette.neutral[800],      // Main app background
    elevated: palette.neutral[700],  // Modals, cards, dropdowns
    surface: palette.neutral[600],   // Higher elevation surfaces
    muted: palette.neutral[900],     // Inset backgrounds, code blocks
    selected: palette.neutral[600],  // Selected/hover items
  },

  // Text colors
  text: {
    primary: palette.neutral[50],    // Main content text
    secondary: palette.neutral[200], // Less emphasis
    tertiary: palette.neutral[300],  // Hints, labels
    muted: palette.neutral[400],     // Disabled, placeholder
    inverse: palette.neutral[900],   // Text on light backgrounds
  },

  // Border colors
  border: {
    default: palette.neutral[500],   // Standard borders
    muted: palette.neutral[600],     // Subtle borders
    strong: palette.neutral[400],    // Emphasized borders
    focus: palette.primary[500],     // Focus states
  },

  // Accent colors (for branding, primary actions)
  accent: {
    default: palette.primary[500],   // Primary accent
    dim: palette.primary[700],       // Dimmed accent
    bright: palette.primary[300],    // Bright accent for emphasis
    muted: palette.primary[800],     // Background tint
  },

  // Semantic status colors
  status: {
    success: {
      default: palette.success[400],
      dim: palette.success[600],
      bright: palette.success[300],
      bg: palette.success[900],
    },
    warning: {
      default: palette.warning[400],
      dim: palette.warning[600],
      bright: palette.warning[300],
      bg: palette.warning[900],
    },
    error: {
      default: palette.error[400],
      dim: palette.error[600],
      bright: palette.error[300],
      bg: palette.error[900],
    },
    info: {
      default: palette.info[400],
      dim: palette.info[600],
      bright: palette.info[300],
      bg: palette.info[900],
    },
  },

  // Interactive element states
  interactive: {
    default: palette.neutral[100],   // Default interactive text
    hover: palette.neutral[50],      // Hover state
    active: palette.primary[400],    // Active/pressed state
    disabled: palette.neutral[400],  // Disabled state
  },

  // Progress indicators
  progress: {
    cloning: palette.info[400],      // Download/clone operations
    indexing: palette.warning[400],  // Processing operations
    complete: palette.success[400],  // Completed operations
    error: palette.error[400],       // Failed operations
  },

  // Score/rating colors
  score: {
    high: palette.success[400],      // > 80%
    medium: palette.warning[400],    // > 50%
    low: palette.error[400],         // <= 50%
  },
} as const

// Export palette for advanced use cases
export { palette }

// Type helpers
export type Colors = typeof colors
export type Palette = typeof palette

import { getSourceIconUrl, getVisitorSourceDisplay } from "@/lib/ai-sources";

interface AISourceIconProps {
  refSource: string;
  size?: number; // Size in pixels (16, 24, 32, etc.)
  className?: string;
  showLabel?: boolean;
}

/**
 * Reusable AI Source Icon component
 * Displays favicon for AI sources (ChatGPT, Perplexity, etc.) using Google Favicon API
 *
 * @param refSource - The AI source enum value
 * @param size - Icon size in pixels (default: 16)
 * @param className - Additional CSS classes
 * @param showLabel - Whether to show the AI source name next to the icon
 */
export function AISourceIcon({
  refSource,
  size = 16,
  className = "",
  showLabel = false
}: AISourceIconProps) {
  const display_name = getVisitorSourceDisplay(refSource);

  // Don't render icon for "Other" sources
  if (refSource === 'other' || refSource === '') {
    return showLabel ? <span className="text-muted-foreground">{display_name}</span> : null;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <img
        src={getSourceIconUrl(refSource, false, size * 2)} // 2x for retina displays
        alt={`${display_name} icon`}
        className={`inline-block object-contain`}
        style={{ width: `${size}px`, height: `${size}px` }}
        onError={(e) => {
          // Fallback to smaller size if 2x fails
          const img = e.currentTarget;
          if (!img.src.includes(`sz=${size}`)) {
            img.src = getSourceIconUrl(refSource, false, size);
          } else {
            // Hide if both sizes fail
            img.style.display = 'none';
          }
        }}
      />
      {showLabel && <span>{display_name}</span>}
    </span>
  );
}

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Activity } from "lucide-react";

interface PublicAnalyticsHeaderProps {
  projectName: string;
}

export function PublicAnalyticsHeader({ projectName }: PublicAnalyticsHeaderProps) {
  return (
    <div className="bg-primary/5 border-b py-2">
      <div className="container mx-auto px-4 flex items-center justify-between gap-2">
        {/* Left: AICW Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <Activity className="h-5 w-5 text-primary" />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="font-bold text-sm">AICW</span>
            <span className="text-[9px] text-muted-foreground tracking-wide">AI Content & Web</span>
          </div>
        </Link>

        {/* Center: Public Analytics label - hidden on mobile */}
        <span className="hidden md:block text-sm text-muted-foreground text-center truncate">
          <strong>Public</strong> Analytics for <strong className="text-foreground">{projectName}</strong>
        </span>

        {/* Mobile: Compact project name */}
        <span className="md:hidden text-xs text-muted-foreground truncate max-w-[140px] sm:max-w-[200px]">
          <strong className="text-foreground">{projectName}</strong>
        </span>

        {/* Right: CTA button - responsive text */}
        <Link to="/" className="flex-shrink-0">
          <Button size="sm" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">Try AICW For Your Website</span>
            <span className="sm:hidden">Try AICW</span>
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

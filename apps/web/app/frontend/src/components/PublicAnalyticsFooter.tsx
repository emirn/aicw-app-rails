import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function PublicAnalyticsFooter() {
  return (
    <div className="bg-primary/5 border-t py-3 sm:py-2 mt-8">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center sm:justify-between gap-3 sm:gap-4">
        <div className="text-sm text-muted-foreground text-center sm:text-left">
          <div>
            Powered by{" "}
            <Link to="/" className="font-medium underline hover:text-foreground">
              AICW
            </Link>
          </div>
          <div className="text-xs mt-1">
            Data refreshed every 24h. Disable public access in project's Settings.
          </div>
        </div>
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

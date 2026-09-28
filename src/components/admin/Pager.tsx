import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Footer for server-paginated admin tables: "1–50 of 1,234" + Prev / Next. */
export function Pager({
  page, pageSize, total, onPage, loading,
}: { page: number; pageSize: number; total: number; onPage: (p: number) => void; loading?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t text-sm text-muted-foreground">
      <span>{total === 0 ? "No results" : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>Page {page} of {pages}</span>
        <Button variant="outline" size="sm" disabled={loading || page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Debounces a value (e.g. a search box) before it triggers a server query. */
export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <div className="container mx-auto px-4 py-6">
        <Link to="/" className="inline-block">
          <div className="font-display text-2xl text-brand-teal font-bold">SchoolBooksExperts</div>
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase">A Complete Family Store</div>
        </Link>
      </div>
      <div className="flex-1 flex items-start md:items-center justify-center px-4 py-8">
        <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-lg border border-border p-7 md:p-8">
          <h1 className="font-display text-2xl font-bold text-brand-navy text-center">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground text-center mt-1.5">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.83Z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z"/>
    </svg>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle } from "lucide-react";
import { SiteShell } from "@/components/layout/site-chrome";
import { unsubscribeNewsletterByToken } from "@/lib/site.functions";

export const Route = createFileRoute("/newsletter/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === "string" ? s.token : "" }),
  head: () => ({ meta: [{ title: "Unsubscribe — SchoolBooksExperts" }, { name: "robots", content: "noindex" }] }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const fn = useServerFn(unsubscribeNewsletterByToken);
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("fail"); return; }
    fn({ data: { token } })
      .then((r) => { setEmail(r.email); setState(r.ok ? "ok" : "fail"); })
      .catch(() => setState("fail"));
  }, [token, fn]);

  return (
    <SiteShell>
      <section className="container mx-auto px-4 py-20 max-w-md text-center">
        {state === "loading" && <p className="text-muted-foreground">Processing your request…</p>}
        {state === "ok" && (
          <>
            <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-3" />
            <h1 className="font-display text-3xl text-brand-navy">You've been unsubscribed</h1>
            <p className="text-muted-foreground mt-2">{email} will no longer receive newsletter emails from us.</p>
            <p className="text-sm text-muted-foreground mt-6">Changed your mind? <a href="/" className="text-brand-teal underline">Resubscribe on our homepage</a>.</p>
          </>
        )}
        {state === "fail" && (
          <>
            <XCircle className="h-14 w-14 text-destructive mx-auto mb-3" />
            <h1 className="font-display text-3xl text-brand-navy">Invalid link</h1>
            <p className="text-muted-foreground mt-2">This unsubscribe link is invalid or has expired. Please contact hello@schoolbooksexperts.com if you need help.</p>
          </>
        )}
      </section>
    </SiteShell>
  );
}

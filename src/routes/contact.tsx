import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Phone, MapPin, MessageCircle, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SiteShell } from "@/components/layout/site-chrome";
import { submitContactMessage, getStoreSettings } from "@/lib/site.functions";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — SchoolBooksExperts" },
      { name: "description", content: "Get in touch with SchoolBooksExperts in Urdu Bazaar, Lahore. Phone, WhatsApp, email and store hours." },
      { property: "og:title", content: "Contact SchoolBooksExperts" },
      { property: "og:description", content: "Reach our family store in Urdu Bazaar, Lahore." },
      { property: "og:url", content: "/contact" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Invalid email"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  subject: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().min(5, "Message is too short").max(4000),
});

function ContactPage() {
  const submit = useServerFn(submitContactMessage);
  const settingsFn = useServerFn(getStoreSettings);
  const settingsQuery = useQuery({ queryKey: ["store-settings"], queryFn: () => settingsFn() });
  const settings: any = settingsQuery.data ?? {};
  const contactEmail = settings.contact_email || "hello@schoolbooksexperts.com";
  const contactPhone = settings.contact_phone || "+92 300 0000000";
  const phoneDigits = (contactPhone || "").replace(/[^\d]/g, "");
  const address = settings.address || "Urdu Bazaar, Lahore, Pakistan";
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setBusy(true);
    try {
      await submit({ data: parsed.data });
      toast.success("Message sent — we'll reply within one business day");
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell>
      <section className="bg-brand-navy text-white py-14">
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Get in Touch</h1>
          <p className="mt-3 text-white/80 max-w-xl mx-auto">
            Questions about a book, an order, a school list? We're here every day.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-12 grid md:grid-cols-2 gap-8">
        <form onSubmit={onSubmit} className="bg-white border border-border rounded-xl p-6 md:p-8 space-y-4">
          <h2 className="font-display text-2xl text-brand-navy">Send us a message</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-brand-navy">Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} required />
            </div>
            <div>
              <label className="text-sm font-medium text-brand-navy">Email *</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} required />
            </div>
            <div>
              <label className="text-sm font-medium text-brand-navy">Phone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} placeholder="+92 …" />
            </div>
            <div>
              <label className="text-sm font-medium text-brand-navy">Subject</label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={160} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-brand-navy">Message *</label>
            <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} maxLength={4000} required />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-brand-teal hover:bg-brand-teal-dark">
            <Send className="h-4 w-4 mr-2" /> {busy ? "Sending..." : "Send Message"}
          </Button>
          <p className="text-xs text-muted-foreground">By submitting you agree to our <a href="/privacy" className="underline">Privacy Policy</a>.</p>
        </form>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded-xl p-6">
            <h3 className="font-display text-xl text-brand-navy mb-4">Reach us directly</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3"><MapPin className="h-5 w-5 text-brand-teal shrink-0" />
                <div><div className="font-medium text-brand-navy">Visit</div><div className="text-muted-foreground">{address}</div></div>
              </li>
              <li className="flex gap-3"><Phone className="h-5 w-5 text-brand-teal shrink-0" />
                <div><div className="font-medium text-brand-navy">Call</div>
                  <a href={`tel:${phoneDigits}`} className="text-muted-foreground hover:text-brand-teal">{contactPhone}</a></div>
              </li>
              <li className="flex gap-3"><MessageCircle className="h-5 w-5 text-green-500 shrink-0" />
                <div><div className="font-medium text-brand-navy">WhatsApp</div>
                  <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-green-600">{contactPhone}</a></div>
              </li>
              <li className="flex gap-3"><Mail className="h-5 w-5 text-brand-teal shrink-0" />
                <div><div className="font-medium text-brand-navy">Email</div>
                  <a href={`mailto:${contactEmail}`} className="text-muted-foreground hover:text-brand-teal">{contactEmail}</a></div>
              </li>
              <li className="flex gap-3"><Clock className="h-5 w-5 text-brand-teal shrink-0" />
                <div><div className="font-medium text-brand-navy">Hours</div>
                  <div className="text-muted-foreground">Mon–Sat: 10 AM – 9 PM<br />Sun: 12 PM – 8 PM</div></div>
              </li>
            </ul>
          </div>
          <div className="rounded-xl overflow-hidden border border-border h-64">
            <iframe
              title="Store location"
              src="https://www.google.com/maps?q=Urdu+Bazaar,+Lahore&output=embed"
              className="w-full h-full"
              loading="lazy"
            />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { listAddresses, upsertAddress, deleteAddress } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/account/addresses")({ component: AddressesPage });

function AddressesPage() {
  const list = useServerFn(listAddresses);
  const upsert = useServerFn(upsertAddress);
  const del = useServerFn(deleteAddress);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["addresses"], queryFn: () => list() });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "Home", street: "", city: "", province: "", postal_code: "", phone: "+92", is_default: false });
  const save = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["addresses"] }); setAdding(false); toast.success("Address saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-brand-navy">Addresses</h1>
        <Button onClick={() => setAdding((v) => !v)} className="bg-brand-teal hover:bg-brand-teal-dark"><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>
      {adding && (
        <div className="border rounded-lg p-4 mb-6 grid sm:grid-cols-2 gap-3">
          <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Street</Label><Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>Province</Label><Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></div>
          <div><Label>Postal code</Label><Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Set as default</label>
          <Button onClick={() => save.mutate()} className="sm:col-span-2 bg-brand-teal hover:bg-brand-teal-dark">Save address</Button>
        </div>
      )}
      {!data?.length ? (
        <div className="text-center py-12"><MapPin className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No addresses saved.</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {data.map((a) => (
            <div key={a.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-brand-navy">{a.label ?? "Address"} {a.is_default && <span className="ml-1 text-xs bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded">Default</span>}</div>
                  <div className="text-sm text-muted-foreground mt-1">{a.street}, {a.city}{a.province ? `, ${a.province}` : ""}</div>
                  {a.phone && <div className="text-sm text-muted-foreground">{a.phone}</div>}
                </div>
                <button onClick={() => remove.mutate(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

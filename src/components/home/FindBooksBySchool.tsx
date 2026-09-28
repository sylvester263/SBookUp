import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, Check, MessageCircle, BookOpen, NotebookPen, Pencil, ShoppingBag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  schoolsQuery,
  schoolClassesQuery,
  schoolBundleQuery,
  WHATSAPP_LINK,
  type School,
  type SchoolBundleItem,
} from "@/lib/schools-data";
import { cartStore } from "@/lib/cart-store";
import { pkr } from "@/components/layout/site-chrome";

function SchoolCard({
  school,
  selected,
  onSelect,
}: {
  school: School;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`shrink-0 w-[180px] md:w-auto text-left bg-white rounded-xl p-4 border-2 transition relative ${
        selected
          ? "border-brand-teal shadow-md"
          : "border-border hover:border-brand-teal/50"
      }`}
    >
      {selected && (
        <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-brand-gold text-white flex items-center justify-center shadow">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="h-16 w-16 mb-3 rounded-full bg-gradient-to-br from-brand-teal/10 to-brand-gold/10 flex items-center justify-center overflow-hidden">
        {school.logo_url ? (
          <img src={school.logo_url} alt={school.name} className="h-full w-full object-cover" />
        ) : (
          <BookOpen className="h-7 w-7 text-brand-teal" />
        )}
      </div>
      <div className="font-semibold text-sm text-brand-navy line-clamp-2 mb-2 min-h-[2.5rem]">
        {school.name}
      </div>
      <div className="text-xs font-semibold text-brand-teal">View Classes →</div>
    </button>
  );
}

function BundleDisplay({
  schoolId,
  classId,
  schoolName,
  className,
}: {
  schoolId: string;
  classId: string;
  schoolName: string;
  className: string;
}) {
  const { data: bundle, isLoading } = useQuery(schoolBundleQuery(schoolId, classId));

  if (isLoading) {
    return <Skeleton className="w-full h-[280px] rounded-xl" />;
  }

  if (!bundle) {
    return (
      <div className="bg-white rounded-xl border-2 border-dashed border-border p-6 md:p-8 text-center">
        <div className="text-4xl mb-3">📚</div>
        <h4 className="font-display text-lg font-bold text-brand-navy mb-2">
          Bundle coming soon for {schoolName} {className}!
        </h4>
        <p className="text-sm text-muted-foreground mb-4">
          WhatsApp us to get a custom book list for your child.
        </p>
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold"
        >
          <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
        </a>
      </div>
    );
  }

  const books = bundle.items.filter((i) => i.item_type === "book");
  const notebooks = bundle.items.filter((i) => i.item_type === "notebook");
  const stationery = bundle.items.filter((i) => i.item_type === "stationery");

  // The whole school list is ONE cart line priced at the bundle price (set by the
  // school in admin). The server re-prices it from the database and reduces stock
  // for every item inside it.
  const addBundleToCart = () => {
    const perBundle = bundle.items
      .filter((it) => it.product)
      .map((it) => Math.floor((it.product!.stock_quantity ?? 0) / Math.max(1, it.quantity)));
    const available = perBundle.length ? Math.min(...perBundle) : 0;
    const added = cartStore.add(
      {
        key: `sb:${bundle.id}`,
        school_bundle_id: bundle.id,
        name: `${schoolName} — ${className} (${bundle.bundle_name})`,
        image: bundle.items.find((it) => it.product?.images?.[0])?.product?.images?.[0],
        price: Number(bundle.total_price), // display only; the server re-prices at checkout
        children: bundle.items.filter((it) => it.product).map((it) => `${it.quantity} × ${it.product!.name}`),
      },
      { max: available },
    );
    if (added === 0) {
      const short = bundle.items.filter((it) => it.product && (it.product.stock_quantity ?? 0) < it.quantity).map((it) => it.product!.name);
      return toast.error(short.length ? `Not enough stock for: ${short.join(", ")}` : "No more of this bundle available");
    }
    toast.success(`Added ${bundle.bundle_name} to cart`);
  };

  const addSingle = (it: SchoolBundleItem) => {
    if (!it.product) return;
    const unit = it.product.sale_price ?? it.product.price;
    const added = cartStore.add(
      {
        key: it.product.id,
        product_id: it.product.id,
        name: it.product.name,
        image: it.product.images?.[0],
        price: Number(unit), // display only; the server re-prices at checkout
        quantity: 1,
        slug: it.product.slug,
      },
      { max: it.product.stock_quantity },
    );
    if (added === 0) return toast.error(it.product.stock_quantity <= 0 ? `${it.product.name} is out of stock` : `No more ${it.product.name} in stock`);
    toast.success(`Added ${it.product.name}`);
  };

  const Section = ({
    label,
    icon: Icon,
    items,
  }: {
    label: string;
    icon: any;
    items: SchoolBundleItem[];
  }) => {
    if (items.length === 0) return null;
    return (
      <div className="py-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-teal mb-2">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-brand-teal shrink-0" />
              <span className="flex-1 text-brand-navy">
                {it.product?.name ?? "Unknown product"}
                {it.quantity > 1 && <span className="text-muted-foreground"> × {it.quantity}</span>}
              </span>
              {it.product && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {pkr(Number(it.product.sale_price ?? it.product.price))}
                  </span>
                  <button
                    onClick={() => addSingle(it)}
                    className="text-xs px-2 py-1 rounded-full border border-brand-teal text-brand-teal hover:bg-brand-teal hover:text-white transition"
                  >
                    + Add
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-brand-teal to-brand-teal/80 text-white p-4">
        <div className="text-xs uppercase tracking-wider text-white/80 mb-1">Complete Bundle</div>
        <h4 className="font-display text-lg md:text-xl font-bold">📚 {bundle.bundle_name}</h4>
      </div>
      <div className="p-4 md:p-6 divide-y divide-border">
        <Section label="Books" icon={BookOpen} items={books} />
        <Section label="Notebooks" icon={NotebookPen} items={notebooks} />
        <Section label="Stationery" icon={Pencil} items={stationery} />
      </div>
      <div className="border-t border-border bg-brand-cream/40 p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-brand-navy">Bundle Total</span>
          <span className="font-display text-2xl font-bold text-brand-gold">
            {pkr(Number(bundle.total_price))}
          </span>
        </div>
        <button
          onClick={addBundleToCart}
          className="w-full bg-brand-teal hover:bg-brand-teal-dark text-white py-3 rounded-full font-semibold flex items-center justify-center gap-2 transition"
        >
          <ShoppingBag className="h-4 w-4" /> Add Bundle to Cart
        </button>
        <p className="text-center text-xs text-muted-foreground mt-2">Or add items individually above</p>
      </div>
    </div>
  );
}

export default function FindBooksBySchool() {
  const { data: schools, isLoading } = useQuery(schoolsQuery({ featuredOnly: true }));
  const [search, setSearch] = useState("");
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const { data: classes, isLoading: classesLoading } = useQuery(
    schoolClassesQuery(selectedSchool?.id),
  );

  const filtered = useMemo(() => {
    const list = schools ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [schools, search]);

  const selectedClass = classes?.find((c) => c.id === selectedClassId) ?? null;

  return (
    <section className="container mx-auto px-4 py-8 md:py-12">
      <div className="max-w-2xl mx-auto text-center mb-6 md:mb-8">
        <h2 className="font-display text-2xl md:text-4xl font-bold text-brand-teal mb-2">
          Find Books by School
        </h2>
        <div className="h-1 w-20 bg-brand-gold mx-auto rounded-full mb-3" />
        <p className="text-sm md:text-base text-muted-foreground">
          Select your school, then pick the class to get a complete book + notebook bundle
        </p>
      </div>

      {/* Search */}
      <div className="max-w-xl mx-auto mb-5">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your school name..."
            className="w-full h-12 pl-11 pr-4 rounded-full border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
        </div>
      </div>

      {/* Schools row */}
      {isLoading ? (
        <div className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="shrink-0 w-[180px] md:w-auto h-[180px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-brand-navy mb-3">
            Don't see your school? Contact us on WhatsApp.
          </p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold"
          >
            <MessageCircle className="h-4 w-4" /> Chat with us
          </a>
        </div>
      ) : (
        <div className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {filtered.map((s) => (
            <SchoolCard
              key={s.id}
              school={s}
              selected={selectedSchool?.id === s.id}
              onSelect={() => {
                setSelectedSchool(s);
                setSelectedClassId(null);
              }}
            />
          ))}
        </div>
      )}

      {/* Browse all schools */}
      <div className="text-center mt-4">
        <Link to="/schools" className="text-sm font-semibold text-brand-teal hover:underline">
          Browse all schools →
        </Link>
      </div>

      {/* Class selector */}
      {selectedSchool && (
        <div className="mt-6 md:mt-8 animate-in slide-in-from-top-4 duration-300">
          <h3 className="font-display text-lg md:text-xl font-bold text-brand-navy mb-3 text-center">
            Select Class for {selectedSchool.name}
          </h3>
          {classesLoading ? (
            <div className="flex flex-wrap gap-2 justify-center">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-20 rounded-full" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center">
              {(classes ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                    selectedClassId === c.id
                      ? "bg-brand-teal text-white border-brand-teal"
                      : "bg-white text-brand-navy border-border hover:border-brand-teal"
                  }`}
                >
                  {c.class_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bundle display */}
      {selectedSchool && selectedClass && (
        <div className="mt-6 md:mt-8 max-w-3xl mx-auto animate-in fade-in duration-300">
          <BundleDisplay
            schoolId={selectedSchool.id}
            classId={selectedClass.id}
            schoolName={selectedSchool.name}
            className={selectedClass.class_name}
          />
        </div>
      )}
    </section>
  );
}

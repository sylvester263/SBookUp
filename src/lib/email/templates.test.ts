import { describe, expect, it } from "vitest";
import { esc, layout, orderTable, textToHtml } from "./templates.server";

describe("email templates", () => {
  it("escapes customer-supplied text", () => {
    expect(esc(`<script>alert("x")</script>&'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;");
    expect(textToHtml("Hi <b>\n\nsecond")).toBe('<p style="margin:0 0 14px">Hi &lt;b&gt;</p><p style="margin:0 0 14px">second</p>');
  });

  it("renders order totals including discount and tax", () => {
    const html = orderTable({
      order_number: "JSN-1", status: "pending", payment_method: "cod", payment_status: "pending",
      subtotal: 2900, discount_amount: 290, shipping_cost: 550, tax_amount: 261, total: 3421,
      coupon_code: "TENOFF", shipping_address: null,
      items: [{ name_snapshot: "Maths <5>", quantity: 2, subtotal: 1600 }],
    });
    expect(html).toContain("Maths &lt;5&gt; × 2");
    expect(html).toContain("Discount (TENOFF)");
    expect(html).toContain("PKR 3,421");
    expect(html).toContain("Tax");
  });

  it("uses the store name when there is no logo", () => {
    const html = layout({ store_name: "Test & Co" }, "Hello", "<p>x</p>");
    expect(html).toContain("Test &amp; Co");
    expect(html).not.toContain("<img");
  });
});

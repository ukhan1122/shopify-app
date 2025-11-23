import { redirect } from "react-router";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  
  // ✅ FIXED: Redirect to NEW correct route
  if (shop) {
    return redirect(`/app/products?shop=${shop}`);
  } else {
    return redirect("/app/products");
  }
}

export default function AppIndex() {
  return null; // This will redirect immediately
}
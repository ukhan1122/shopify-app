import { redirect } from "react-router";

export async function loader() {
  return redirect("/admin/products");
}

export default function Index() {
  return null;
}
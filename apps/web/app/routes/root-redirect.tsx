import { redirect } from "react-router";

export async function loader() {
  // Redirect root to French version
  // TODO: detect browser language preference
  return redirect("/fr/", { status: 302 });
}

export default function RootRedirect() {
  return null;
}

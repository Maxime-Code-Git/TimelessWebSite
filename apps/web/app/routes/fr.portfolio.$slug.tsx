import { redirect } from "react-router";

export function loader() {
  return redirect("/fr/portfolio", 301);
}

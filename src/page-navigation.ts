export type Page = "home" | "study" | "profile" | "admin" | "catalog" | "planner" | "prompts" | "productivity" | "trails";
export type Route = { page: Page; item: string };
const pages: Page[] = ["home","study","profile","admin","catalog","planner","prompts","productivity","trails"];
export function readRoute(search = location.search): Route {
  const params = new URLSearchParams(search);
  const page = params.get("page") as Page;
  return { page: pages.includes(page) ? page : "home", item: params.get("item") ?? "" };
}
export function pageHref(page: Page, item = "") {
  const params = new URLSearchParams({ page });
  if (page === "study" && item) params.set("item", item);
  return location.pathname + "?" + params.toString();
}

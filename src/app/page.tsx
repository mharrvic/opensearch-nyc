import { SearchWorkbench } from "@/components/app/search-workbench";

export default function Home() {
  return <SearchWorkbench appTitle={process.env.NEXT_PUBLIC_APP_TITLE} />;
}
